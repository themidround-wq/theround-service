import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { Category, Question } from '../catalog/catalog.entities';
import { EmailService } from '../email/email.service';
import { Round } from '../rounds/round.entity';
import { RoundsService } from '../rounds/rounds.service';
import { StorageService } from '../storage/storage.service';
import { UsersModule } from '../users/users.module';
import { UsersService } from '../users/users.service';
import { PracticeSession } from './practice-session.entity';
import { PracticeService } from './practice.service';
import { AssessmentService } from '../assessment/assessment.service';
import { MarkingService } from '../assessment/marking.service';
import { TranscriptionService } from '../assessment/transcription.service';
import { SettingsModule } from '../settings/settings.service';

const audio = {
  buffer: Buffer.from('a'),
  mimetype: 'audio/webm;codecs=opus',
} as Express.Multer.File;

describe('PracticeService', () => {
  let practice: PracticeService;
  let rounds: RoundsService;
  let userId: string;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true }),
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          autoLoadEntities: true,
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Round, PracticeSession, Category, Question]),
        JwtModule.register({ secret: 'test', global: true }),
        CatalogModule,
        UsersModule,
        SettingsModule,
      ],
      providers: [
        PracticeService,
        RoundsService,
        AssessmentService,
        TranscriptionService,
        MarkingService,
        {
          provide: EmailService,
          useValue: { sendFirstRound: jest.fn(), sendMilestone: jest.fn() },
        },
        {
          provide: StorageService,
          useValue: { save: (key: string) => key, isRemote: false },
        },
      ],
    }).compile();
    await mod.init(); // seeds the catalog incl. practice topics and slugs
    practice = mod.get(PracticeService);
    rounds = mod.get(RoundsService);
    const users = mod.get(UsersService);
    const { user } = await users.upsertFromGoogle({
      googleId: 'g-1',
      email: 'nkem@example.com',
      name: 'Nkem',
    });
    await users.update(user.id, { course: 'Midwifery', stage: 'student' });
    userId = user.id;
  });

  const answer = async (sessionId: string, seconds = 70) => {
    const s = await practice.get(userId, sessionId);
    const last = s.rounds.at(-1)!;
    await practice.complete(userId, last.id, seconds, audio);
    return practice.review(userId, last.id);
  };

  it('runs a session: question → recording → feedback → retake → next', async () => {
    const s = await practice.start(userId, 'labour');
    expect(s.title).toBe('Labour & Delivery');
    expect(s.categoryId).toBe('labour');
    expect(s.rounds).toHaveLength(1);
    expect(s.rounds[0]).toMatchObject({
      status: 'ready',
      prompt: 'Let’s practise labour and delivery',
      durationSeconds: 90,
    });

    const quick = await practice.setDuration(userId, s.rounds[0].id, 240);
    expect(quick.rounds[0].durationSeconds).toBe(240);

    const recorded = await practice.complete(
      userId,
      s.rounds[0].id,
      150,
      audio,
    );
    expect(recorded.rounds[0]).toMatchObject({
      status: 'recorded',
      spokenSeconds: 150,
      hasAudio: true,
    });

    const reviewed = await practice.review(userId, s.rounds[0].id);
    const fb = reviewed.rounds[0].feedback as {
      score: number;
      examiner: unknown[];
    };
    expect(reviewed.rounds[0].status).toBe('reviewed');
    expect(fb.score).toBeGreaterThanOrEqual(38);
    expect(fb.examiner).toHaveLength(4);

    const retake = await practice.retake(userId, s.id);
    expect(retake.rounds).toHaveLength(2);
    expect(retake.rounds[1]).toMatchObject({
      retake: true,
      question: retake.rounds[0].question,
      durationSeconds: 240,
    });

    await answer(s.id);
    const next = await practice.next(userId, s.id);
    expect(next.rounds[2].categoryId).toBe('labour');
    expect(next.rounds[2].question).not.toBe(next.rounds[1].question);
  });

  it('counts reviewed practice rounds in the classic history and stats', async () => {
    const s = await practice.start(userId, 'newborn');
    await answer(s.id, 80);
    const history = await rounds.list(userId, { page: 1, limit: 10 });
    expect(history.total).toBe(1);
    const stats = await practice.stats(userId);
    expect(stats).toMatchObject({
      rounds: 1,
      speakingMinutes: 1,
      streakDays: 1,
    });
    expect(stats.averageScore).toBe(stats.bestScore);
  });

  it('switches topic inside a session and resolves "surprise" to the user’s course', async () => {
    const s = await practice.start(userId, 'surprise');
    expect([
      'anatomy',
      'physiology',
      'pharmacology',
      'fon',
      'antenatal',
      'labour',
      'postnatal',
      'newborn',
    ]).toContain(s.categoryId);
    await answer(s.id);
    const picking = await practice.changeTopic(userId, s.id);
    expect(picking.pickingTopic).toBe(true);
    const switched = await practice.pickTopic(userId, s.id, 'fon');
    expect(switched.pickingTopic).toBe(false);
    expect(switched.rounds.at(-1)!.categoryId).toBe('fon');
  });

  it('renames, deletes (soft) and restores', async () => {
    const s = await practice.start(userId, 'antenatal');
    expect(
      (await practice.rename(userId, s.id, '  Booking visits  ')).title,
    ).toBe('Booking visits');
    const deleted = await practice.remove(userId, s.id);
    expect(deleted.title).toBe('Booking visits');
    expect(await practice.list(userId)).toHaveLength(0);
    await expect(practice.get(userId, s.id)).rejects.toThrow(
      'Session not found',
    );
    await practice.restore(userId, s.id);
    expect((await practice.list(userId)).map((x) => x.id)).toEqual([s.id]);
  });

  it('keeps practice rounds when the classic wheel spins', async () => {
    const s = await practice.start(userId, 'postnatal');
    await rounds.spin(userId);
    expect((await practice.get(userId, s.id)).rounds).toHaveLength(1);
  });

  it('accepts a recording without audio (no microphone)', async () => {
    const s = await practice.start(userId, 'anatomy');
    const r = await practice.complete(userId, s.rounds[0].id, 30);
    expect(r.rounds[0]).toMatchObject({ status: 'recorded', hasAudio: false });
  });
});

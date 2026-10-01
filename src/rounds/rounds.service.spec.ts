import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { EmailService } from '../email/email.service';
import { StorageService } from '../storage/storage.service';
import { UsersModule } from '../users/users.module';
import { UsersService } from '../users/users.service';
import { Round } from './round.entity';
import { RoundsService } from './rounds.service';

const sendFirstRound = jest.fn();
const sendMilestone = jest.fn<
  unknown,
  [string, string, { totalRounds: number }]
>();

/** celebrate() runs after save() returns; let it finish. */
const settle = () => new Promise((r) => setTimeout(r, 50));

describe('RoundsService progress emails', () => {
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
        TypeOrmModule.forFeature([Round]),
        JwtModule.register({ secret: 'test', global: true }),
        CatalogModule,
        UsersModule,
      ],
      providers: [
        RoundsService,
        { provide: EmailService, useValue: { sendFirstRound, sendMilestone } },
        { provide: StorageService, useValue: { save: (key: string) => key } },
      ],
    }).compile();
    await mod.init(); // seeds the catalog
    rounds = mod.get(RoundsService);
    const { user } = await mod.get(UsersService).upsertFromGoogle({
      googleId: 'g-1',
      email: 'nkem@example.com',
      name: 'Nkem',
    });
    userId = user.id;
    sendFirstRound.mockReset();
    sendMilestone.mockReset();
  });

  const practise = async () => {
    const { id } = await rounds.spin(userId);
    await rounds.start(userId, id, {});
    await rounds.complete(userId, id, { spokenSeconds: 60 }, {
      buffer: Buffer.from('a'),
      mimetype: 'audio/webm',
    } as Express.Multer.File);
    const saved = await rounds.save(userId, id, { reflection: 'clear' });
    await settle();
    return saved;
  };

  it('emails the first saved round with what was practised', async () => {
    const saved = await practise();
    expect(sendFirstRound).toHaveBeenCalledWith('nkem@example.com', userId, {
      name: 'Nkem',
      category: saved.category.name,
      question: saved.question.text,
      spokenSeconds: 60,
      reflection: 'clear',
    });
    expect(sendMilestone).not.toHaveBeenCalled();
  });

  it('emails milestones at 5 and 10 rounds only', async () => {
    for (let i = 0; i < 10; i++) await practise();
    expect(sendFirstRound).toHaveBeenCalledTimes(1);
    expect(sendMilestone.mock.calls.map((c) => c[2].totalRounds)).toEqual([
      5, 10,
    ]);
    expect(sendMilestone.mock.calls[1][2]).toMatchObject({
      name: 'Nkem',
      totalRounds: 10,
      speakingSeconds: 600,
      currentStreakDays: 1,
    });
  });
});

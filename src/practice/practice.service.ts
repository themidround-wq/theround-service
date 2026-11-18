import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Category, Question } from '../catalog/catalog.entities';
import { Round } from '../rounds/round.entity';
import { RoundsService } from '../rounds/rounds.service';
import { StorageService } from '../storage/storage.service';
import { UsersService } from '../users/users.service';
import { AssessmentService } from '../assessment/assessment.service';
import { PracticeSession } from './practice-session.entity';
import { displayName, phrase, topicsFor } from './topics';

const EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-m4a': 'm4a',
};

/** Round status as the app sees it. */
const STATUS: Record<string, 'ready' | 'recorded' | 'reviewed'> = {
  spun: 'ready',
  in_progress: 'ready',
  completed: 'recorded',
  saved: 'reviewed',
};

/**
 * Chat-style practice sessions (the app's main screen). Each session is a
 * thread of ordinary rounds, so reviewed practice rounds also count in the
 * classic history, stats and admin dashboard ("saved" rounds).
 */
@Injectable()
export class PracticeService {
  constructor(
    @InjectRepository(PracticeSession)
    private readonly sessions: Repository<PracticeSession>,
    @InjectRepository(Round) private readonly rounds: Repository<Round>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(Question)
    private readonly questions: Repository<Question>,
    private readonly users: UsersService,
    private readonly storage: StorageService,
    private readonly classic: RoundsService,
    private readonly assessment: AssessmentService,
  ) {}

  // ---- serialisation -------------------------------------------------------

  private roundDto(r: Round, fallbackSlug: string) {
    return {
      id: r.id,
      categoryId: r.category?.slug ?? fallbackSlug,
      topic: r.topic.name,
      question: r.question.text,
      prompt: r.prompt ?? '',
      intro: r.intro ?? '',
      retake: r.retake,
      durationSeconds: r.durationSeconds,
      status: STATUS[r.status] ?? 'ready',
      spokenSeconds: r.spokenSeconds,
      hasAudio: !!r.audioKey,
      feedback: r.feedback,
      transcript: r.transcript,
      feedbackSource: r.feedbackSource,
      createdAt: r.createdAt,
    };
  }

  private async sessionDto(userId: string, id: string) {
    const session = await this.sessions.findOne({
      where: { id, user: { id: userId }, deletedAt: IsNull() },
    });
    if (!session) throw new NotFoundException('Session not found');
    const rounds = await this.rounds.find({
      where: { session: { id } },
      order: { createdAt: 'ASC' },
    });
    return {
      id: session.id,
      title: session.title,
      categoryId: session.categorySlug,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      pickingTopic: session.pickingTopic,
      rounds: rounds.map((r) => this.roundDto(r, session.categorySlug)),
    };
  }

  // ---- lookups -------------------------------------------------------------

  private async ownedSession(userId: string, id: string) {
    const s = await this.sessions.findOne({
      where: { id, user: { id: userId }, deletedAt: IsNull() },
    });
    if (!s) throw new NotFoundException('Session not found');
    return s;
  }

  private async ownedRound(userId: string, id: string) {
    const r = await this.rounds.findOne({
      where: { id, user: { id: userId }, session: { deletedAt: IsNull() } },
      relations: { session: true },
    });
    if (!r?.session) throw new NotFoundException('Round not found');
    return r as Round & { session: PracticeSession };
  }

  private async lastRound(sessionId: string) {
    const r = await this.rounds.findOne({
      where: { session: { id: sessionId } },
      order: { createdAt: 'DESC' },
    });
    if (!r) throw new NotFoundException('Session has no rounds');
    return r;
  }

  /** "surprise" → the least-practised topic for the user's course. */
  private async resolveSlug(userId: string, input: string) {
    if (input !== 'surprise') return input;
    const user = await this.users.findById(userId);
    const options = await this.playableSlugs(topicsFor(user.course));
    if (!options.length)
      throw new BadRequestException('No topics available yet');
    const counts = await this.rounds
      .createQueryBuilder('r')
      .innerJoin('r.category', 'c')
      .select('c.slug', 'slug')
      .addSelect('COUNT(*)', 'n')
      .where('r.userId = :userId AND r.status = :s', { userId, s: 'saved' })
      .groupBy('c.slug')
      .getRawMany<{ slug: string; n: string }>();
    const done = new Map(counts.map((c) => [c.slug, Number(c.n)]));
    const min = Math.min(...options.map((s) => done.get(s) ?? 0));
    const least = options.filter((s) => (done.get(s) ?? 0) === min);
    return least[Math.floor(Math.random() * least.length)];
  }

  /** Slugs whose category is active and has at least one question. */
  private async playableSlugs(slugs: readonly string[]) {
    const cats = await this.categories.find({
      where: { slug: In([...slugs]), active: true },
      relations: { topics: { questions: true } },
    });
    const ok = new Set(
      cats
        .filter((c) => c.topics.some((t) => t.questions.length))
        .map((c) => c.slug),
    );
    return slugs.filter((s) => ok.has(s));
  }

  /** Least-asked question in a category for this user, avoiding `avoidId`. */
  private async pickQuestion(userId: string, slug: string, avoidId?: string) {
    const category = await this.categories.findOne({
      where: { slug, active: true },
    });
    if (!category) throw new BadRequestException(`Unknown topic "${slug}"`);
    const all = await this.questions.find({
      where: { topic: { category: { id: category.id } } },
      relations: { topic: true },
    });
    if (!all.length)
      throw new BadRequestException('No questions in this topic yet');
    const pool = all.filter((q) => q.id !== avoidId);
    const options = pool.length ? pool : all;
    const asked = await this.rounds
      .createQueryBuilder('r')
      .select('r.questionId', 'id')
      .addSelect('COUNT(*)', 'n')
      .where('r.userId = :userId AND r.questionId IN (:...ids)', {
        userId,
        ids: options.map((q) => q.id),
      })
      .groupBy('r.questionId')
      .getRawMany<{ id: string; n: string }>();
    const n = new Map(asked.map((a) => [a.id, Number(a.n)]));
    const min = Math.min(...options.map((q) => n.get(q.id) ?? 0));
    const least = options.filter((q) => (n.get(q.id) ?? 0) === min);
    const question = least[Math.floor(Math.random() * least.length)];
    return { category, topic: question.topic, question };
  }

  private async addRound(
    userId: string,
    session: PracticeSession,
    slug: string,
    text: { prompt: string; intro: string },
    opts: { questionId?: string; retake?: boolean; duration?: number } = {},
  ) {
    const user = await this.users.findById(userId);
    let picked: Awaited<ReturnType<PracticeService['pickQuestion']>>;
    if (opts.questionId) {
      const question = await this.questions.findOneOrFail({
        where: { id: opts.questionId },
        relations: { topic: { category: true } },
      });
      picked = {
        category: question.topic.category,
        topic: question.topic,
        question,
      };
    } else {
      picked = await this.pickQuestion(userId, slug);
    }
    await this.rounds.save(
      this.rounds.create({
        user: { id: userId },
        session,
        category: picked.category,
        topic: picked.topic,
        question: picked.question,
        durationSeconds: opts.duration ?? user.defaultResponseSeconds,
        prompt: text.prompt,
        intro: text.intro,
        retake: Boolean(opts.retake),
      }),
    );
  }

  private async nameOf(slug: string) {
    const c = await this.categories.findOne({ where: { slug } });
    return displayName(slug, c?.name ?? slug);
  }

  // ---- sessions ------------------------------------------------------------

  async list(userId: string) {
    const rows = await this.sessions.find({
      where: { user: { id: userId }, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return rows.map((s) => ({
      id: s.id,
      title: s.title,
      categoryId: s.categorySlug,
      createdAt: s.createdAt,
    }));
  }

  get(userId: string, id: string) {
    return this.sessionDto(userId, id);
  }

  async start(userId: string, input: string) {
    const slug = await this.resolveSlug(userId, input);
    const name = await this.nameOf(slug);
    const session = await this.sessions.save(
      this.sessions.create({
        user: { id: userId },
        title: name,
        categorySlug: slug,
      }),
    );
    const surprise = input === 'surprise';
    const cat = await this.categories.findOne({ where: { slug } });
    await this.addRound(userId, session, slug, {
      prompt: surprise
        ? 'Surprise me'
        : `Let’s practise ${phrase(slug, cat?.name ?? slug)}`,
      intro: surprise
        ? `Let’s go with ${name}. Here’s your question — answer it out loud.`
        : `${name} it is. Here’s your question — answer it out loud.`,
    });
    return this.sessionDto(userId, session.id);
  }

  async rename(userId: string, id: string, title: string) {
    const s = await this.ownedSession(userId, id);
    s.title = title.trim().slice(0, 80);
    await this.sessions.save(s);
    return this.sessionDto(userId, id);
  }

  async remove(userId: string, id: string) {
    const s = await this.ownedSession(userId, id);
    const first = await this.rounds.findOne({
      where: { session: { id } },
      order: { createdAt: 'ASC' },
    });
    s.deletedAt = new Date();
    await this.sessions.save(s);
    return { id: s.id, title: s.title, topic: first?.topic.name ?? '' };
  }

  async restore(userId: string, id: string) {
    const s = await this.sessions.findOne({
      where: { id, user: { id: userId }, deletedAt: Not(IsNull()) },
    });
    if (!s) throw new NotFoundException('Nothing to restore');
    s.deletedAt = null;
    await this.sessions.save(s);
  }

  async retake(userId: string, id: string) {
    const s = await this.ownedSession(userId, id);
    const last = await this.lastRound(id);
    if (last.status !== 'saved')
      throw new ConflictException('Finish this round first');
    s.pickingTopic = false;
    await this.sessions.save(s);
    await this.addRound(
      userId,
      s,
      last.category.slug ?? s.categorySlug,
      {
        prompt: 'Let me try that again',
        intro: 'Same question, a fresh start. Put that feedback into practice.',
      },
      {
        questionId: last.question.id,
        retake: true,
        duration: last.durationSeconds,
      },
    );
    return this.sessionDto(userId, id);
  }

  async next(userId: string, id: string) {
    const s = await this.ownedSession(userId, id);
    const last = await this.lastRound(id);
    if (last.status !== 'saved')
      throw new ConflictException('Finish this round first');
    s.pickingTopic = false;
    await this.sessions.save(s);
    const slug = last.category.slug ?? s.categorySlug;
    const picked = await this.pickQuestion(userId, slug, last.question.id);
    await this.addRound(
      userId,
      s,
      slug,
      {
        prompt: 'Next question, please',
        intro: 'Here’s another one — answer it out loud.',
      },
      { questionId: picked.question.id, duration: last.durationSeconds },
    );
    return this.sessionDto(userId, id);
  }

  async changeTopic(userId: string, id: string) {
    const s = await this.ownedSession(userId, id);
    s.pickingTopic = true;
    await this.sessions.save(s);
    return this.sessionDto(userId, id);
  }

  async pickTopic(userId: string, id: string, input: string) {
    const s = await this.ownedSession(userId, id);
    const slug = await this.resolveSlug(userId, input);
    const name = await this.nameOf(slug);
    const cat = await this.categories.findOne({ where: { slug } });
    // Drop an unanswered question so the thread doesn't keep dead cards.
    const last = await this.lastRound(id);
    if (last.status === 'spun') await this.rounds.remove(last);
    s.pickingTopic = false;
    await this.sessions.save(s);
    await this.addRound(userId, s, slug, {
      prompt:
        input === 'surprise'
          ? 'Surprise me'
          : `Let’s practise ${phrase(slug, cat?.name ?? slug)}`,
      intro: `${name} it is. Here’s your question — answer it out loud.`,
    });
    return this.sessionDto(userId, id);
  }

  // ---- rounds --------------------------------------------------------------

  async setDuration(userId: string, roundId: string, seconds: number) {
    const r = await this.ownedRound(userId, roundId);
    if (r.status !== 'spun')
      throw new ConflictException('Round already answered');
    r.durationSeconds = seconds;
    await this.rounds.save(r);
    return this.sessionDto(userId, r.session.id);
  }

  async different(userId: string, roundId: string) {
    const r = await this.ownedRound(userId, roundId);
    if (r.status !== 'spun')
      throw new ConflictException('Round already answered');
    const picked = await this.pickQuestion(
      userId,
      r.category.slug ?? r.session.categorySlug,
      r.question.id,
    );
    r.topic = picked.topic;
    r.question = picked.question;
    r.retake = false;
    await this.rounds.save(r);
    return this.sessionDto(userId, r.session.id);
  }

  /** Recording finished. Audio is optional (the app can run without a mic). */
  async complete(
    userId: string,
    roundId: string,
    spokenSeconds: number,
    file?: Express.Multer.File,
  ) {
    const r = await this.ownedRound(userId, roundId);
    if (r.status !== 'spun' && r.status !== 'in_progress')
      throw new ConflictException('Round already answered');
    if (spokenSeconds > r.durationSeconds + 5)
      throw new BadRequestException('spokenSeconds exceeds the allowed time');
    if (file) {
      const mime = file.mimetype.split(';')[0];
      const ext = EXT[mime];
      if (!ext)
        throw new BadRequestException(
          `Unsupported audio type ${file.mimetype}`,
        );
      r.audioKey = await this.storage.save(
        `${userId}/${r.id}.${ext}`,
        file.buffer,
        mime,
      );
      r.audioMime = mime;
    }
    r.spokenSeconds = Math.max(1, Math.round(spokenSeconds));
    r.startedAt ??= new Date(Date.now() - r.spokenSeconds * 1000);
    r.completedAt = new Date();
    r.status = 'completed';
    await this.rounds.save(r);
    return this.sessionDto(userId, r.session.id);
  }

  /** Score the answer and save the round (→ counts in history and stats). */
  async review(userId: string, roundId: string) {
    const r = await this.ownedRound(userId, roundId);
    if (r.status === 'completed') {
      const user = await this.users.findById(userId);
      const a = await this.assessment.assess(
        r,
        user,
        r.category.slug ?? r.session.categorySlug,
      );
      r.feedback = a.feedback as unknown as Record<string, unknown>;
      r.score = a.feedback.score;
      r.transcript = a.transcript;
      r.feedbackSource = a.source;
      r.markingMeta = a.meta;
      r.status = 'saved';
      r.savedAt = new Date();
      await this.rounds.save(r);
    }
    return this.sessionDto(userId, r.session.id);
  }

  async audio(userId: string, roundId: string, origin: string) {
    await this.ownedRound(userId, roundId);
    return this.classic.audioUrl(userId, roundId, origin);
  }

  async stats(userId: string) {
    const scored = await this.rounds.find({
      where: { user: { id: userId }, status: 'saved', score: Not(IsNull()) },
      select: { id: true, score: true, spokenSeconds: true },
    });
    const scores = scored.map((r) => r.score!);
    const classic = await this.classic.stats(userId);
    return {
      rounds: scored.length,
      averageScore: scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null,
      bestScore: scores.length ? Math.max(...scores) : null,
      speakingMinutes: Math.round(
        scored.reduce((a, r) => a + (r.spokenSeconds ?? 0), 0) / 60,
      ),
      streakDays: classic.currentStreakDays,
    };
  }

  /** Topic chips for the user's course, limited to topics that can be served. */
  async topics(userId: string) {
    const user = await this.users.findById(userId);
    return this.playableSlugs(topicsFor(user.course));
  }
}

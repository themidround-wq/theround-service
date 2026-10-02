import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { Category, Question, Topic } from '../catalog/catalog.entities';
import { EmailService } from '../email/email.service';
import { Round } from '../rounds/round.entity';
import { RoundsService } from '../rounds/rounds.service';
import { StorageService } from '../storage/storage.service';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { WaitlistEntry } from '../waitlist/waitlist.entity';
import { AdminUser } from './admin.entities';
import { AuditService } from './audit.service';
import {
  CreateCategoryDto,
  CreateQuestionDto,
  CreateTopicDto,
  ListAdminRoundsDto,
  ListUsersDto,
  ListWaitlistDto,
  UpdateCategoryDto,
} from './dto';

const DAY = 86_400_000;
const TICKET_OFFSET = 1000;

/** Raw dates come back as strings from SQLite and Dates from Postgres. */
const toDate = (v: string | Date | null | undefined): Date | null => {
  if (v == null) return null;
  if (v instanceof Date) return v;
  // SQLite: "2026-10-01 12:00:00.000", stored as UTC without a zone.
  const s = String(v);
  return new Date(
    /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z',
  );
};

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** UTC midnight `days - 1` days ago, so the window includes today. */
const windowStart = (days: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - (days - 1) * DAY);
};

/** One zeroed bucket per UTC day in the window. */
const emptySeries = (days: number) => {
  const start = windowStart(days).getTime();
  return Array.from({ length: days }, (_, i) =>
    dayKey(new Date(start + i * DAY)),
  );
};

const page = <T>(
  items: T[],
  total: number,
  q: { page: number; limit: number },
) => ({
  items,
  total,
  page: q.page,
  limit: q.limit,
  hasMore: q.page * q.limit < total,
});

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(WaitlistEntry)
    private readonly waitlist: Repository<WaitlistEntry>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Round) private readonly rounds: Repository<Round>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(Topic) private readonly topics: Repository<Topic>,
    @InjectRepository(Question)
    private readonly questions: Repository<Question>,
    private readonly roundsService: RoundsService,
    private readonly usersService: UsersService,
    private readonly storage: StorageService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  // ---- overview ------------------------------------------------------------

  async overview(days: number) {
    const weekAgo = new Date(Date.now() - 7 * DAY);
    const twoWeeksAgo = new Date(Date.now() - 14 * DAY);
    const today = windowStart(1);
    // Wide enough for both the chart and the week-over-week deltas.
    const since = new Date(
      Math.min(windowStart(days).getTime(), twoWeeksAgo.getTime()),
    );

    const [
      waitlistTotal,
      usersTotal,
      onboarded,
      suspended,
      savedTotal,
      waitlistRows,
      userRows,
      savedRows,
      speaking,
      converted,
    ] = await Promise.all([
      this.waitlist.count(),
      this.users.count(),
      this.users.countBy({ onboarded: true }),
      this.users.countBy({ suspendedAt: Not(IsNull()) }),
      this.rounds.countBy({ status: 'saved' }),
      this.waitlist.find({
        where: { createdAt: MoreThanOrEqual(since) },
        select: { id: true, createdAt: true },
      }),
      this.users.find({
        where: { createdAt: MoreThanOrEqual(since) },
        select: { id: true, createdAt: true },
      }),
      this.rounds
        .createQueryBuilder('r')
        .select('r.savedAt', 'savedAt')
        .addSelect('r.userId', 'userId')
        .where('r.status = :s AND r.savedAt >= :since', {
          s: 'saved',
          since,
        })
        .getRawMany<{ savedAt: string | Date | null; userId: string }>(),
      this.rounds
        .createQueryBuilder('r')
        .select('COALESCE(SUM(r.spokenSeconds), 0)', 'n')
        .where('r.status = :s', { s: 'saved' })
        .getRawOne<{ n: string }>(),
      this.waitlist
        .createQueryBuilder('w')
        .innerJoin(User, 'u', 'u.email = w.email')
        .getCount(),
    ]);

    const inRange = (d: Date | null, from: Date, to = new Date(8.64e15)) =>
      !!d && d >= from && d < to;
    const saved = savedRows.map((r) => ({
      at: toDate(r.savedAt)!,
      userId: r.userId,
    }));

    const keys = emptySeries(days);
    const series = new Map(
      keys.map((k) => [k, { date: k, waitlist: 0, users: 0, rounds: 0 }]),
    );
    for (const w of waitlistRows) {
      const b = series.get(dayKey(w.createdAt));
      if (b) b.waitlist++;
    }
    for (const u of userRows) {
      const b = series.get(dayKey(u.createdAt));
      if (b) b.users++;
    }
    for (const r of saved) {
      const b = series.get(dayKey(r.at));
      if (b) b.rounds++;
    }

    const count = <T>(
      rows: T[],
      at: (r: T) => Date | null,
      from: Date,
      to?: Date,
    ) => rows.filter((r) => inRange(at(r), from, to)).length;

    const [recentWaitlist, recentUsers] = await Promise.all([
      this.listWaitlist({ page: 1, limit: 6 }),
      this.listUsers({ page: 1, limit: 6 }),
    ]);

    return {
      kpis: {
        waitlistTotal,
        waitlistToday: count(waitlistRows, (w) => w.createdAt, today),
        waitlistThisWeek: count(waitlistRows, (w) => w.createdAt, weekAgo),
        waitlistLastWeek: count(
          waitlistRows,
          (w) => w.createdAt,
          twoWeeksAgo,
          weekAgo,
        ),
        waitlistConverted: converted,
        usersTotal,
        usersThisWeek: count(userRows, (u) => u.createdAt, weekAgo),
        usersLastWeek: count(
          userRows,
          (u) => u.createdAt,
          twoWeeksAgo,
          weekAgo,
        ),
        onboarded,
        suspended,
        roundsSaved: savedTotal,
        roundsThisWeek: count(saved, (r) => r.at, weekAgo),
        roundsLastWeek: count(saved, (r) => r.at, twoWeeksAgo, weekAgo),
        speakingSeconds: Number(speaking?.n ?? 0),
        activeUsers7d: new Set(
          saved.filter((r) => r.at >= weekAgo).map((r) => r.userId),
        ).size,
      },
      series: [...series.values()],
      recentWaitlist: recentWaitlist.items,
      recentUsers: recentUsers.items,
    };
  }

  /** Practice behaviour across every round started in the window. */
  async activity(days: number) {
    const since = windowStart(days);
    const rows = await this.rounds
      .createQueryBuilder('r')
      .select([
        'r.status AS status',
        'r.durationSeconds AS "durationSeconds"',
        'r.spokenSeconds AS "spokenSeconds"',
        'r.reflection AS reflection',
        'r.categoryId AS "categoryId"',
        'r.userId AS "userId"',
        'r.startedAt AS "startedAt"',
        'r.savedAt AS "savedAt"',
      ])
      .where('r.createdAt >= :since', { since })
      .getRawMany<{
        status: string;
        durationSeconds: number;
        spokenSeconds: number | null;
        reflection: string | null;
        categoryId: string;
        userId: string;
        startedAt: string | Date | null;
        savedAt: string | Date | null;
      }>();
    const categories = await this.categories.find({
      order: { sortOrder: 'ASC' },
    });

    const reached = (s: string) =>
      ({ spun: 0, in_progress: 1, completed: 2, saved: 3 })[s] ?? 0;
    const funnel = { spun: rows.length, started: 0, completed: 0, saved: 0 };
    const reflections: Record<string, number> = {};
    const byCategory = new Map(categories.map((c) => [c.id, 0]));
    const length = { quick: 0, case: 0 };
    let spoken = 0;
    let spokenN = 0;
    const series = new Map(
      emptySeries(days).map((k) => [
        k,
        { date: k, rounds: 0, activeUsers: new Set<string>() },
      ]),
    );

    for (const r of rows) {
      const step = reached(r.status);
      if (step >= 1) funnel.started++;
      if (step >= 2) funnel.completed++;
      if (step < 3) continue;
      funnel.saved++;
      const reflection = r.reflection ?? 'none';
      reflections[reflection] = (reflections[reflection] ?? 0) + 1;
      byCategory.set(r.categoryId, (byCategory.get(r.categoryId) ?? 0) + 1);
      length[Number(r.durationSeconds) >= 240 ? 'case' : 'quick']++;
      if (r.spokenSeconds) {
        spoken += Number(r.spokenSeconds);
        spokenN++;
      }
      const at = toDate(r.savedAt);
      const b = at && series.get(dayKey(at));
      if (b) {
        b.rounds++;
        b.activeUsers.add(r.userId);
      }
    }

    return {
      funnel,
      reflections,
      length,
      avgSpokenSeconds: spokenN ? Math.round(spoken / spokenN) : 0,
      practisingUsers: new Set(
        rows.filter((r) => reached(r.status) === 3).map((r) => r.userId),
      ).size,
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        rounds: byCategory.get(c.id) ?? 0,
      })),
      series: [...series.values()].map((b) => ({
        date: b.date,
        rounds: b.rounds,
        activeUsers: b.activeUsers.size,
      })),
    };
  }

  // ---- waitlist ------------------------------------------------------------

  async listWaitlist(
    q: Pick<ListWaitlistDto, 'page' | 'limit' | 'search' | 'status'>,
  ) {
    const qb = this.waitlist
      .createQueryBuilder('w')
      .leftJoin(User, 'u', 'u.email = w.email');
    if (q.search) {
      qb.andWhere('LOWER(w.email) LIKE :s', {
        s: `%${q.search.toLowerCase()}%`,
      });
    }
    if (q.status === 'joined') qb.andWhere('u.id IS NOT NULL');
    if (q.status === 'invited')
      qb.andWhere('u.id IS NULL AND w.invitedAt IS NOT NULL');
    if (q.status === 'pending')
      qb.andWhere('u.id IS NULL AND w.invitedAt IS NULL');

    const total = await qb.clone().getCount();
    const rows = await qb
      .select('w.id', 'id')
      .addSelect('w.email', 'email')
      .addSelect('w.createdAt', 'createdAt')
      .addSelect('w.invitedAt', 'invitedAt')
      .addSelect('u.id', 'userId')
      .orderBy('w.id', 'DESC')
      .offset((q.page - 1) * q.limit)
      .limit(q.limit)
      .getRawMany<{
        id: string;
        email: string;
        createdAt: string | Date;
        invitedAt: string | Date | null;
        userId: string | null;
      }>();

    return page(
      rows.map((r) => ({
        id: Number(r.id),
        ticketNumber: TICKET_OFFSET + Number(r.id),
        email: r.email,
        createdAt: toDate(r.createdAt),
        invitedAt: toDate(r.invitedAt),
        userId: r.userId,
        status: r.userId ? 'joined' : r.invitedAt ? 'invited' : 'pending',
      })),
      total,
      q,
    );
  }

  /** Every row, for CSV export. */
  async exportWaitlist() {
    const n = await this.waitlist.count();
    return (await this.listWaitlist({ page: 1, limit: Math.max(n, 1) })).items;
  }

  /** Manual adds send no confirmation email. Existing emails are skipped. */
  async addWaitlist(by: AdminUser, emails: string[]) {
    const unique = [...new Set(emails)];
    const existing = new Set(
      (
        await this.waitlist.find({
          where: { email: In(unique) },
          select: { email: true },
        })
      ).map((w) => w.email),
    );
    const fresh = unique.filter((e) => !existing.has(e));
    if (fresh.length)
      await this.waitlist.insert(fresh.map((email) => ({ email })));
    await this.audit.record(by, 'waitlist.add', null, {
      added: fresh.length,
      skipped: unique.length - fresh.length,
    });
    return { added: fresh.length, skipped: unique.length - fresh.length };
  }

  /**
   * Sends the launch invite. People who already have an account are skipped;
   * re-inviting is allowed (Resend's idempotency key stops a double-send
   * within 24h).
   */
  async inviteWaitlist(by: AdminUser, ids: number[]) {
    const entries = await this.waitlist.find({
      where: { id: In(ids.map(String)) },
    });
    const joined = new Set(
      (
        await this.users.find({
          where: { email: In(entries.map((e) => e.email)) },
          select: { email: true },
        })
      ).map((u) => u.email),
    );
    const result = { sent: 0, skipped: 0, failed: 0, emailDisabled: false };
    for (const e of entries) {
      if (joined.has(e.email)) {
        result.skipped++;
        continue;
      }
      const id = Number(e.id);
      const outcome = await this.email.sendWaitlistInvite(
        e.email,
        id,
        TICKET_OFFSET + id,
      );
      if (outcome === 'sent') {
        result.sent++;
        await this.waitlist.update(e.id, { invitedAt: new Date() });
      } else {
        result.failed++;
        if (outcome === 'disabled') result.emailDisabled = true;
      }
    }
    await this.audit.record(by, 'waitlist.invite', null, { ids, ...result });
    return result;
  }

  async removeWaitlist(by: AdminUser, id: number) {
    const entry = await this.waitlist.findOneBy({ id: String(id) });
    if (!entry) throw new NotFoundException('Waitlist entry not found');
    await this.waitlist.remove(entry);
    await this.audit.record(by, 'waitlist.delete', entry.email);
  }

  // ---- users ---------------------------------------------------------------

  async listUsers(
    q: Pick<ListUsersDto, 'page' | 'limit' | 'search' | 'stage' | 'status'>,
  ) {
    const qb = this.users.createQueryBuilder('u');
    if (q.search) {
      qb.andWhere('(LOWER(u.email) LIKE :s OR LOWER(u.name) LIKE :s)', {
        s: `%${q.search.toLowerCase()}%`,
      });
    }
    if (q.stage) qb.andWhere('u.stage = :stage', { stage: q.stage });
    if (q.status === 'suspended') qb.andWhere('u.suspendedAt IS NOT NULL');
    if (q.status === 'onboarded')
      qb.andWhere('u.onboarded = :t AND u.suspendedAt IS NULL', { t: true });
    if (q.status === 'onboarding')
      qb.andWhere('u.onboarded = :f AND u.suspendedAt IS NULL', { f: false });

    const total = await qb.clone().getCount();
    const users = await qb
      .orderBy('u.createdAt', 'DESC')
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getMany();

    const stats = users.length
      ? await this.rounds
          .createQueryBuilder('r')
          .select('r.userId', 'userId')
          .addSelect('COUNT(*)', 'n')
          .addSelect('MAX(r.savedAt)', 'last')
          .where('r.status = :s AND r.userId IN (:...ids)', {
            s: 'saved',
            ids: users.map((u) => u.id),
          })
          .groupBy('r.userId')
          .getRawMany<{
            userId: string;
            n: string;
            last: string | Date | null;
          }>()
      : [];
    const byUser = new Map(stats.map((s) => [s.userId, s]));

    return page(
      users.map((u) => ({
        ...this.userDto(u),
        roundsSaved: Number(byUser.get(u.id)?.n ?? 0),
        lastRoundAt: toDate(byUser.get(u.id)?.last),
      })),
      total,
      q,
    );
  }

  private userDto(u: User) {
    return {
      ...this.usersService.toDto(u),
      suspendedAt: u.suspendedAt,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }

  async getUser(id: string) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    const [stats, recent, waitlist] = await Promise.all([
      this.roundsService.stats(id),
      this.listRounds({ page: 1, limit: 20, userId: id }),
      this.waitlist.findOneBy({ email: user.email }),
    ]);
    return {
      user: this.userDto(user),
      stats,
      rounds: recent,
      waitlist: waitlist
        ? {
            ticketNumber: TICKET_OFFSET + Number(waitlist.id),
            joinedAt: waitlist.createdAt,
          }
        : null,
    };
  }

  async setSuspended(by: AdminUser, id: string, suspended: boolean) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    user.suspendedAt = suspended ? new Date() : null;
    await this.users.save(user);
    await this.audit.record(
      by,
      suspended ? 'user.suspend' : 'user.unsuspend',
      user.email,
    );
    return this.userDto(user);
  }

  /** Deletes the account, its rounds and their audio. Not reversible. */
  async deleteUser(by: AdminUser, id: string) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    const rounds = await this.rounds.find({
      where: { user: { id } },
      select: { id: true, audioKey: true },
      loadEagerRelations: false,
    });
    for (const r of rounds)
      if (r.audioKey) await this.storage.remove(r.audioKey);
    await this.rounds.delete({ user: { id } });
    await this.users.remove(user);
    await this.audit.record(by, 'user.delete', user.email, {
      rounds: rounds.length,
    });
  }

  // ---- rounds --------------------------------------------------------------

  async listRounds(
    q: Pick<
      ListAdminRoundsDto,
      'page' | 'limit' | 'search' | 'status' | 'categoryId' | 'userId'
    >,
  ) {
    const qb = this.rounds
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.user', 'user')
      .innerJoinAndSelect('r.category', 'category')
      .innerJoinAndSelect('r.topic', 'topic')
      .innerJoinAndSelect('r.question', 'question');
    if (q.status) qb.andWhere('r.status = :status', { status: q.status });
    if (q.categoryId) qb.andWhere('category.id = :cid', { cid: q.categoryId });
    if (q.userId) qb.andWhere('user.id = :uid', { uid: q.userId });
    if (q.search) {
      qb.andWhere(
        '(LOWER(user.email) LIKE :s OR LOWER(question.text) LIKE :s OR LOWER(topic.name) LIKE :s)',
        { s: `%${q.search.toLowerCase()}%` },
      );
    }
    const [items, total] = await qb
      .orderBy('r.createdAt', 'DESC')
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getManyAndCount();
    return page(
      items.map((r) => ({
        ...this.roundsService.toDto(r),
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        user: { id: r.user.id, email: r.user.email, name: r.user.name },
      })),
      total,
      q,
    );
  }

  private async roundOwner(id: string) {
    const round = await this.rounds.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!round) throw new NotFoundException('Round not found');
    return round;
  }

  async roundAudio(by: AdminUser, id: string, origin: string) {
    const round = await this.roundOwner(id);
    const url = await this.roundsService.audioUrl(round.user.id, id, origin);
    await this.audit.record(by, 'round.listen', id, { user: round.user.email });
    return url;
  }

  async deleteRound(by: AdminUser, id: string) {
    const round = await this.roundOwner(id);
    await this.roundsService.remove(round.user.id, id);
    await this.audit.record(by, 'round.delete', id, { user: round.user.email });
  }

  // ---- catalog -------------------------------------------------------------

  async catalog() {
    const [categories, counts] = await Promise.all([
      this.categories.find({
        order: { sortOrder: 'ASC' },
        relations: { topics: { questions: true } },
      }),
      this.rounds
        .createQueryBuilder('r')
        .select('r.questionId', 'questionId')
        .addSelect('COUNT(*)', 'n')
        .where('r.status = :s', { s: 'saved' })
        .groupBy('r.questionId')
        .getRawMany<{ questionId: string; n: string }>(),
    ]);
    const byQuestion = new Map(counts.map((c) => [c.questionId, Number(c.n)]));
    const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

    return categories.map((c) => {
      const topics = [...c.topics]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => {
          const questions = t.questions.map((q) => ({
            id: q.id,
            text: q.text,
            rounds: byQuestion.get(q.id) ?? 0,
          }));
          return {
            id: t.id,
            name: t.name,
            rounds: sum(questions.map((q) => q.rounds)),
            questions,
          };
        });
      return {
        id: c.id,
        name: c.name,
        sortOrder: c.sortOrder,
        active: c.active,
        /** On the wheel only when active and at least one topic has a question. */
        playable: c.active && topics.some((t) => t.questions.length > 0),
        rounds: sum(topics.map((t) => t.rounds)),
        topics,
      };
    });
  }

  private async inUse(where: Record<string, { id: string }>, what: string) {
    const n = await this.rounds.count({ where });
    if (n > 0) {
      throw new ConflictException(
        `This ${what} is used by ${n} practice round${n === 1 ? '' : 's'}, so it can't be deleted.${what === 'category' ? ' Hide it instead.' : ' Edit it instead.'}`,
      );
    }
  }

  private async assertUniqueCategory(name: string, exceptId?: string) {
    const clash = await this.categories
      .createQueryBuilder('c')
      .where('LOWER(c.name) = :n', { n: name.toLowerCase() })
      .getOne();
    if (clash && clash.id !== exceptId) {
      throw new ConflictException('A category with that name already exists');
    }
  }

  async createCategory(by: AdminUser, dto: CreateCategoryDto) {
    await this.assertUniqueCategory(dto.name);
    const last = await this.categories.findOne({
      where: {},
      order: { sortOrder: 'DESC' },
    });
    const c = await this.categories.save({
      name: dto.name,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    });
    await this.audit.record(by, 'catalog.category_create', c.name);
    return c;
  }

  async updateCategory(by: AdminUser, id: string, dto: UpdateCategoryDto) {
    const c = await this.categories.findOneBy({ id });
    if (!c) throw new NotFoundException('Category not found');
    if (dto.name) await this.assertUniqueCategory(dto.name, id);
    const before = { name: c.name, active: c.active };
    if (dto.name !== undefined) c.name = dto.name;
    if (dto.active !== undefined) c.active = dto.active;
    await this.categories.save(c);
    await this.audit.record(by, 'catalog.category_update', c.name, {
      before,
      after: dto,
    });
    return c;
  }

  async reorderCategories(by: AdminUser, ids: string[]) {
    const all = await this.categories.find();
    if (ids.length !== all.length || !all.every((c) => ids.includes(c.id))) {
      throw new ConflictException('Send every category id exactly once');
    }
    await this.categories.save(ids.map((id, i) => ({ id, sortOrder: i })));
    await this.audit.record(by, 'catalog.category_reorder');
  }

  async deleteCategory(by: AdminUser, id: string) {
    const c = await this.categories.findOneBy({ id });
    if (!c) throw new NotFoundException('Category not found');
    await this.inUse({ category: { id } }, 'category');
    await this.categories.remove(c);
    await this.audit.record(by, 'catalog.category_delete', c.name);
  }

  async createTopic(by: AdminUser, dto: CreateTopicDto) {
    const category = await this.categories.findOneBy({ id: dto.categoryId });
    if (!category) throw new NotFoundException('Category not found');
    const t = await this.topics.save({ name: dto.name, category });
    await this.audit.record(by, 'catalog.topic_create', t.name, {
      category: category.name,
    });
    return { id: t.id, name: t.name };
  }

  async updateTopic(by: AdminUser, id: string, name: string) {
    const t = await this.topics.findOneBy({ id });
    if (!t) throw new NotFoundException('Topic not found');
    const before = t.name;
    t.name = name;
    await this.topics.save(t);
    await this.audit.record(by, 'catalog.topic_update', name, { before });
    return { id: t.id, name: t.name };
  }

  async deleteTopic(by: AdminUser, id: string) {
    const t = await this.topics.findOneBy({ id });
    if (!t) throw new NotFoundException('Topic not found');
    await this.inUse({ topic: { id } }, 'topic');
    await this.topics.remove(t);
    await this.audit.record(by, 'catalog.topic_delete', t.name);
  }

  async createQuestion(by: AdminUser, dto: CreateQuestionDto) {
    const topic = await this.topics.findOneBy({ id: dto.topicId });
    if (!topic) throw new NotFoundException('Topic not found');
    const q = await this.questions.save({ text: dto.text, topic });
    await this.audit.record(by, 'catalog.question_create', topic.name, {
      text: q.text,
    });
    return { id: q.id, text: q.text };
  }

  async updateQuestion(by: AdminUser, id: string, text: string) {
    const q = await this.questions.findOneBy({ id });
    if (!q) throw new NotFoundException('Question not found');
    const before = q.text;
    q.text = text;
    await this.questions.save(q);
    await this.audit.record(by, 'catalog.question_update', id, {
      before,
      after: text,
    });
    return { id: q.id, text: q.text };
  }

  async deleteQuestion(by: AdminUser, id: string) {
    const q = await this.questions.findOneBy({ id });
    if (!q) throw new NotFoundException('Question not found');
    await this.inUse({ question: { id } }, 'question');
    await this.questions.remove(q);
    await this.audit.record(by, 'catalog.question_delete', id, {
      text: q.text,
    });
  }
}

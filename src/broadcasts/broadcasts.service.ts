import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import {
  DataSource,
  In,
  IsNull,
  LessThan,
  LessThanOrEqual,
  MoreThanOrEqual,
  Or,
  Repository,
} from 'typeorm';
import { EmailService } from '../email/email.service';
import { Round } from '../rounds/round.entity';
import { User } from '../users/user.entity';
import { WaitlistEntry } from '../waitlist/waitlist.entity';
import {
  Audience,
  AUDIENCES,
  Broadcast,
  BroadcastKind,
  BroadcastRecipient,
  EmailUnsubscribe,
  RecipientStatus,
} from './broadcast.entities';
import { BroadcastContent, renderBroadcast, sanitizeBody } from './render';
import { unsubscribeToken } from './unsubscribe-token';

const DAY = 86_400_000;
const BATCH_SIZE = 100;
/** Resend allows ~2 requests/second by default. */
const BATCH_PAUSE_MS = 600;
const LEASE_MS = 2 * 60_000;
const TICK_MS = 15_000;

export const AUDIENCE_INFO: Record<
  Audience,
  { label: string; description: string; users: boolean }
> = {
  users_all: {
    label: 'All users',
    description: 'Everyone with an account (not suspended).',
    users: true,
  },
  users_onboarded: {
    label: 'Onboarded users',
    description: 'Finished onboarding.',
    users: true,
  },
  users_students: {
    label: 'Students',
    description: 'Users who said they are students.',
    users: true,
  },
  users_qualified: {
    label: 'Qualified',
    description: 'Users who said they are qualified.',
    users: true,
  },
  users_inactive: {
    label: 'Inactive users',
    description: 'Onboarded, but no saved round in 14 days.',
    users: true,
  },
  waitlist_pending: {
    label: 'Waitlist without an account',
    description: 'Signed up on the landing page, not in the app yet.',
    users: false,
  },
  waitlist_all: {
    label: 'Whole waitlist',
    description: 'Every waitlist email.',
    users: false,
  },
  everyone: {
    label: 'Everyone',
    description: 'All users and the whole waitlist, once each.',
    users: false,
  },
  custom: {
    label: 'Specific recipients',
    description: 'Send directly to individual email addresses.',
    users: false,
  },
};

type Person = { email: string; name: string | null };

export type BroadcastInput = Partial<
  Pick<
    Broadcast,
    | 'kind'
    | 'subject'
    | 'preheader'
    | 'headline'
    | 'bodyHtml'
    | 'ctaLabel'
    | 'ctaUrl'
    | 'audience'
    | 'customEmails'
  >
>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class BroadcastsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BroadcastsService.name);
  private timer: NodeJS.Timeout | null = null;
  /** Broadcasts this instance is sending right now. */
  private readonly active = new Set<string>();
  private readonly secret: string;
  private readonly publicUrl: string;

  constructor(
    @InjectRepository(Broadcast)
    private readonly broadcasts: Repository<Broadcast>,
    @InjectRepository(BroadcastRecipient)
    private readonly recipients: Repository<BroadcastRecipient>,
    @InjectRepository(EmailUnsubscribe)
    private readonly unsubscribes: Repository<EmailUnsubscribe>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(WaitlistEntry)
    private readonly waitlist: Repository<WaitlistEntry>,
    @InjectRepository(Round) private readonly rounds: Repository<Round>,
    private readonly db: DataSource,
    private readonly email: EmailService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('JWT_SECRET');
    this.publicUrl = (
      config.get<string>('API_PUBLIC_URL') ??
      `http://localhost:${config.get('PORT', 3000)}`
    ).replace(/\/+$/, '');
    if (
      !config.get('API_PUBLIC_URL') &&
      config.get('NODE_ENV') === 'production'
    ) {
      this.logger.warn(
        'API_PUBLIC_URL is not set: unsubscribe links in broadcasts will point at localhost.',
      );
    }
  }

  // ---- worker --------------------------------------------------------------

  /** Picks up due scheduled broadcasts and resumes sends interrupted by a restart. */
  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
    setTimeout(() => void this.tick(), 3000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    try {
      const now = new Date();
      const due = await this.broadcasts.find({
        where: { status: 'scheduled', scheduledAt: LessThanOrEqual(now) },
        select: { id: true },
      });
      for (const b of due)
        await this.start(b.id, ['scheduled']).catch((e) =>
          this.logger.error(`Start ${b.id}: ${String(e)}`),
        );

      const stalled = await this.broadcasts.find({
        where: { status: 'sending', lockedUntil: Or(IsNull(), LessThan(now)) },
        select: { id: true },
      });
      for (const b of stalled)
        if (!this.active.has(b.id)) void this.process(b.id);
    } catch (e) {
      this.logger.error(`Broadcast tick failed: ${String(e)}`);
    }
  }

  /**
   * Moves a draft/scheduled broadcast to `sending` and snapshots its
   * recipients in one transaction, so a crash can't leave a send with no list.
   */
  private async start(id: string, from: ('draft' | 'scheduled')[]) {
    if (!this.email.enabled) {
      this.logger.warn(
        `Broadcast ${id} is due but email is not configured; leaving it scheduled.`,
      );
      return false;
    }
    const b = await this.broadcasts.findOneBy({ id });
    if (!b) return false;
    const { people, suppressed } = await this.resolve(
      b.audience,
      b.kind,
      b.customEmails,
    );

    const claimed = await this.db.transaction(async (m) => {
      const res = await m.update(
        Broadcast,
        { id, status: In(from) },
        {
          status: 'sending',
          startedAt: new Date(),
          recipientCount: people.length,
          suppressedCount: suppressed,
          sentCount: 0,
          failedCount: 0,
        },
      );
      if (!res.affected) return false;
      for (let i = 0; i < people.length; i += 500) {
        await m.insert(
          BroadcastRecipient,
          people
            .slice(i, i + 500)
            .map((p) => ({ broadcast: { id }, email: p.email, name: p.name })),
        );
      }
      return true;
    });
    if (claimed) {
      this.logger.log(
        `Broadcast ${id}: sending to ${people.length} (${suppressed} unsubscribed)`,
      );
      void this.process(id);
    }
    return claimed;
  }

  /** Sends pending recipients in batches until done or cancelled. */
  private async process(id: string) {
    if (this.active.has(id)) return;
    const now = new Date();
    const lease = await this.broadcasts.update(
      { id, status: 'sending', lockedUntil: Or(IsNull(), LessThan(now)) },
      { lockedUntil: new Date(now.getTime() + LEASE_MS) },
    );
    if (!lease.affected) return;
    this.active.add(id);

    try {
      for (;;) {
        const b = await this.broadcasts.findOneBy({ id });
        if (!b || b.status !== 'sending') break;

        const { batch, key } = await this.nextBatch(id);
        if (!batch.length) {
          await this.broadcasts.update(id, {
            status: 'sent',
            sentAt: new Date(),
            lockedUntil: null,
            ...(await this.counts(id)),
          });
          this.logger.log(`Broadcast ${id} finished`);
          break;
        }

        const messages = batch.map((r) => {
          const unsubscribeUrl = this.unsubscribeUrl(r.email);
          return {
            ...renderBroadcast({ ...this.email.context, unsubscribeUrl }, b, r),
            to: r.email,
            unsubscribeUrl,
          };
        });
        const result = await this.email.sendBatch(messages, key);

        // One transaction, so a crash leaves the batch either fully recorded
        // or still `sending` (and re-sent under the same key).
        const sentAt = new Date();
        await this.db.transaction(async (m) => {
          if ('results' in result) {
            for (const [i, r] of batch.entries()) {
              const res = result.results[i];
              await m.update(
                BroadcastRecipient,
                r.id,
                'id' in res
                  ? {
                      status: 'sent',
                      messageId: res.id || null,
                      sentAt,
                      error: null,
                    }
                  : { status: 'failed', error: res.error.slice(0, 500) },
              );
            }
          } else {
            await m.update(
              BroadcastRecipient,
              { id: In(batch.map((r) => r.id)) },
              { status: 'failed', error: result.error.slice(0, 500) },
            );
          }
        });
        await this.broadcasts.update(id, {
          lockedUntil: new Date(Date.now() + LEASE_MS),
          ...(await this.counts(id)),
        });
        await sleep(BATCH_PAUSE_MS);
      }
    } catch (e) {
      // Lease expires and the next tick resumes from the pending rows.
      this.logger.error(`Broadcast ${id} interrupted: ${String(e)}`);
    } finally {
      this.active.delete(id);
    }
  }

  /**
   * The batch to send next: an interrupted one (rows left `sending`) first,
   * with its original key; otherwise up to 100 pending rows, claimed under a
   * new key before anything is sent.
   */
  private async nextBatch(id: string) {
    const stuck = await this.recipients.findOne({
      where: { broadcast: { id }, status: 'sending' },
      select: { id: true, batchKey: true },
    });
    if (stuck?.batchKey) {
      const batch = await this.recipients.find({
        where: {
          broadcast: { id },
          status: 'sending',
          batchKey: stuck.batchKey,
        },
        order: { email: 'ASC' },
      });
      return { batch, key: stuck.batchKey };
    }

    const pending = await this.recipients.find({
      where: { broadcast: { id }, status: 'pending' },
      order: { email: 'ASC' },
      take: BATCH_SIZE,
      select: { id: true, email: true },
    });
    if (!pending.length) return { batch: [], key: '' };
    const ids = pending.map((r) => r.id);
    // Random, not derived from the rows: a later retry of the same people
    // must not reuse a key Resend still remembers (24h).
    const key = `broadcast-${id}-${randomUUID()}`;
    await this.recipients.update(
      { id: In(ids) },
      { status: 'sending', batchKey: key },
    );
    const batch = await this.recipients.find({
      where: { id: In(ids) },
      order: { email: 'ASC' },
    });
    return { batch, key };
  }

  private async counts(id: string) {
    const [sentCount, failedCount] = await Promise.all([
      this.recipients.countBy({ broadcast: { id }, status: 'sent' }),
      this.recipients.countBy({ broadcast: { id }, status: 'failed' }),
    ]);
    return { sentCount, failedCount };
  }

  unsubscribeUrl(email: string) {
    const q = new URLSearchParams({
      email,
      token: unsubscribeToken(email, this.secret),
    });
    return `${this.publicUrl}/api/email/unsubscribe?${q.toString()}`;
  }

  // ---- audiences -----------------------------------------------------------

  /**
   * Who an audience means right now. Unsubscribed addresses are left out,
   * except from maintenance notices and direct messages.
   */
  async resolve(
    audience: Audience,
    kind: BroadcastKind,
    customEmails?: string | null,
  ) {
    const people = new Map<string, Person>();
    const add = (p: Person) => {
      const email = p.email.trim().toLowerCase();
      if (!people.has(email) || (!people.get(email)!.name && p.name))
        people.set(email, { email, name: p.name });
    };

    if (audience === 'custom') {
      const raw = (customEmails ?? '')
        .split(/[\s,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));

      if (raw.length) {
        const [matchedUsers, matchedWaitlist] = await Promise.all([
          this.users.find({
            where: { email: In(raw) },
            select: { email: true, name: true, suspendedAt: true },
          }),
          this.waitlist.find({
            where: { email: In(raw) },
            select: { email: true },
          }),
        ]);

        const userMap = new Map(
          matchedUsers
            .filter((u) => !u.suspendedAt)
            .map((u) => [u.email.toLowerCase(), u.name]),
        );
        const waitlistEmails = new Set(
          matchedWaitlist.map((w) => w.email.toLowerCase()),
        );

        for (const email of raw) {
          if (userMap.has(email)) {
            add({ email, name: userMap.get(email) ?? null });
          } else if (waitlistEmails.has(email)) {
            add({ email, name: null });
          } else {
            add({ email, name: null });
          }
        }
      }
    } else {
      if (AUDIENCE_INFO[audience]?.users || audience === 'everyone') {
        const all = (
          await this.users.find({
            select: {
              id: true,
              email: true,
              name: true,
              stage: true,
              onboarded: true,
              suspendedAt: true,
            },
          })
        ).filter((u) => !u.suspendedAt);
        let chosen = all;
        if (audience === 'users_onboarded')
          chosen = all.filter((u) => u.onboarded);
        if (audience === 'users_students')
          chosen = all.filter((u) => u.stage === 'student');
        if (audience === 'users_qualified')
          chosen = all.filter((u) => u.stage === 'qualified');
        if (audience === 'users_inactive') {
          const active = new Set(
            (
              await this.rounds
                .createQueryBuilder('r')
                .select('DISTINCT r.userId', 'userId')
                .where('r.status = :s AND r.savedAt >= :since', {
                  s: 'saved',
                  since: new Date(Date.now() - 14 * DAY),
                })
                .getRawMany<{ userId: string }>()
            ).map((r) => r.userId),
          );
          chosen = all.filter((u) => u.onboarded && !active.has(u.id));
        }
        chosen.forEach((u) => add({ email: u.email, name: u.name }));
      }

      if (
        audience === 'waitlist_all' ||
        audience === 'waitlist_pending' ||
        audience === 'everyone'
      ) {
        const entries = await this.waitlist.find({ select: { email: true } });
        const hasAccount =
          audience === 'waitlist_pending'
            ? new Set(
                (await this.users.find({ select: { email: true } })).map((u) =>
                  u.email.toLowerCase(),
                ),
              )
            : new Set<string>();
        entries
          .filter((w) => !hasAccount.has(w.email.toLowerCase()))
          .forEach((w) => add({ email: w.email, name: null }));
      }
    }

    if (kind === 'maintenance' || kind === 'direct')
      return { people: [...people.values()], suppressed: 0 };
    const unsubscribed = new Set(
      (await this.unsubscribes.find({ select: { email: true } })).map(
        (u) => u.email,
      ),
    );
    const kept = [...people.values()].filter((p) => !unsubscribed.has(p.email));
    return { people: kept, suppressed: people.size - kept.length };
  }

  async audiences(kind: BroadcastKind = 'newsletter') {
    const presets = AUDIENCES.filter((k) => k !== 'custom');
    return Promise.all(
      presets.map(async (key) => {
        const { people, suppressed } = await this.resolve(key, kind);
        return { key, ...AUDIENCE_INFO[key], count: people.length, suppressed };
      }),
    );
  }

  // ---- drafts --------------------------------------------------------------

  async list(q: { page: number; limit: number; status?: string }) {
    const [items, total] = await this.broadcasts.findAndCount({
      where: q.status ? { status: q.status as Broadcast['status'] } : {},
      order: { updatedAt: 'DESC' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      select: {
        id: true,
        kind: true,
        subject: true,
        audience: true,
        status: true,
        scheduledAt: true,
        sentAt: true,
        startedAt: true,
        recipientCount: true,
        sentCount: true,
        failedCount: true,
        suppressedCount: true,
        createdBy: true,
        updatedBy: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return {
      items,
      total,
      page: q.page,
      limit: q.limit,
      hasMore: q.page * q.limit < total,
    };
  }

  async get(id: string) {
    const b = await this.broadcasts.findOneBy({ id });
    if (!b) throw new NotFoundException('Broadcast not found');
    return b;
  }

  async create(by: string, input: BroadcastInput) {
    return this.broadcasts.save(
      this.broadcasts.create({
        ...this.clean(input),
        createdBy: by,
        updatedBy: by,
      }),
    );
  }

  async update(id: string, by: string, input: BroadcastInput) {
    const b = await this.get(id);
    if (b.status !== 'draft' && b.status !== 'scheduled') {
      throw new ConflictException(
        'Only drafts and scheduled broadcasts can be edited',
      );
    }
    Object.assign(b, this.clean(input), { updatedBy: by });
    if (b.status === 'scheduled') this.assertSendable(b);
    return this.broadcasts.save(b);
  }

  /** Drops undefined fields and sanitises the body on the way in. */
  private clean(input: BroadcastInput) {
    const out: BroadcastInput = {};
    for (const [k, v] of Object.entries(input))
      if (v !== undefined) (out as Record<string, unknown>)[k] = v;
    if (out.bodyHtml !== undefined) out.bodyHtml = sanitizeBody(out.bodyHtml);
    if (out.ctaLabel !== undefined) out.ctaLabel = out.ctaLabel?.trim() || null;
    if (out.ctaUrl !== undefined) out.ctaUrl = out.ctaUrl?.trim() || null;
    if (out.customEmails !== undefined)
      out.customEmails = out.customEmails?.trim() || null;
    return out;
  }

  private assertSendable(b: Broadcast) {
    const problems: string[] = [];
    if (!b.subject.trim()) problems.push('add a subject');
    if (!b.bodyHtml.replace(/<[^>]+>/g, '').trim())
      problems.push('write the message');
    if (!!b.ctaLabel !== !!b.ctaUrl)
      problems.push('give the button both a label and a link');
    if (b.ctaUrl && !/^https:\/\//.test(b.ctaUrl))
      problems.push('use an https:// link for the button');
    if (b.kind === 'maintenance' && !AUDIENCE_INFO[b.audience]?.users) {
      problems.push('send service notices to app users only');
    }
    if (b.audience === 'custom') {
      const raw = (b.customEmails ?? '')
        .split(/[\s,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
      if (!raw.length) problems.push('add at least one valid recipient email');
    }
    if (problems.length)
      throw new BadRequestException(`Before sending, ${problems.join(', ')}.`);
  }

  private assertEmail() {
    if (!this.email.enabled) {
      throw new BadRequestException(
        "Email isn't configured on the API (RESEND_API_KEY and RESEND_FROM).",
      );
    }
  }

  async schedule(id: string, by: string, at: Date) {
    const b = await this.get(id);
    if (b.status !== 'draft' && b.status !== 'scheduled')
      throw new ConflictException('Already sent');
    if (at.getTime() < Date.now() + 60_000)
      throw new BadRequestException('Pick a time at least a minute from now.');
    if (at.getTime() > Date.now() + 365 * DAY)
      throw new BadRequestException('Pick a time within the next year.');
    this.assertSendable(b);
    this.assertEmail();
    await this.broadcasts.update(id, {
      status: 'scheduled',
      scheduledAt: at,
      updatedBy: by,
    });
    return this.get(id);
  }

  async sendNow(id: string) {
    const b = await this.get(id);
    if (b.status !== 'draft' && b.status !== 'scheduled')
      throw new ConflictException('Already sent');
    this.assertSendable(b);
    this.assertEmail();
    const { people } = await this.resolve(b.audience, b.kind, b.customEmails);
    if (!people.length)
      throw new BadRequestException('Nobody is in that audience right now.');
    await this.start(id, ['draft', 'scheduled']);
    return this.get(id);
  }

  /** Puts failed recipients back in the queue and resumes sending. */
  async retryFailed(id: string) {
    const b = await this.get(id);
    if (b.status !== 'sent' && b.status !== 'cancelled') {
      throw new ConflictException(
        'Retry once the send has finished or been stopped',
      );
    }
    this.assertEmail();
    const res = await this.recipients.update(
      { broadcast: { id }, status: 'failed' },
      { status: 'pending', error: null, batchKey: null },
    );
    if (!res.affected)
      throw new BadRequestException('No failed recipients to retry');
    await this.broadcasts.update(id, {
      status: 'sending',
      lockedUntil: null,
      sentAt: null,
    });
    void this.process(id);
    return { retrying: res.affected };
  }

  /** Scheduled → back to draft. Sending → stops after the current batch. */
  async cancel(id: string) {
    const b = await this.get(id);
    if (b.status === 'scheduled') {
      await this.broadcasts.update(id, { status: 'draft', scheduledAt: null });
    } else if (b.status === 'sending') {
      await this.broadcasts.update(id, {
        status: 'cancelled',
        lockedUntil: null,
        ...(await this.counts(id)),
      });
    } else {
      throw new ConflictException('Nothing to cancel');
    }
    return this.get(id);
  }

  async duplicate(id: string, by: string) {
    const b = await this.get(id);
    return this.create(by, {
      kind: b.kind,
      subject: b.subject ? `${b.subject} (copy)` : '',
      preheader: b.preheader,
      headline: b.headline,
      bodyHtml: b.bodyHtml,
      ctaLabel: b.ctaLabel,
      ctaUrl: b.ctaUrl,
      audience: b.audience,
      customEmails: b.customEmails,
    });
  }

  async remove(id: string) {
    const b = await this.get(id);
    if (b.status === 'sending') {
      throw new ConflictException('Stop sending before deleting this broadcast');
    }
    await this.broadcasts.remove(b);
    return b;
  }

  // ---- previews & tests ----------------------------------------------------

  preview(content: BroadcastContent, name: string | null) {
    const unsubscribeUrl = '#unsubscribe';
    return renderBroadcast({ ...this.email.context, unsubscribeUrl }, content, {
      name,
    });
  }

  async sendTest(id: string, to: string[], name: string | null) {
    this.assertEmail();
    const b = await this.get(id);
    if (!b.subject.trim())
      throw new BadRequestException('Add a subject first.');
    const results = await Promise.all(
      to.map(async (addr) => {
        const unsubscribeUrl = this.unsubscribeUrl(addr);
        const email = renderBroadcast(
          { ...this.email.context, unsubscribeUrl },
          b,
          { name },
        );
        return this.email.sendRendered(
          addr,
          { ...email, subject: `[Test] ${email.subject}` },
          unsubscribeUrl,
        );
      }),
    );
    const failed = results.filter((r) => r !== 'sent').length;
    if (failed)
      throw new BadRequestException(
        `${failed} of ${to.length} test emails failed. Check the API logs.`,
      );
    return { sent: to.length };
  }

  async listRecipients(
    id: string,
    q: {
      page: number;
      limit: number;
      status?: RecipientStatus;
      search?: string;
    },
  ) {
    const qb = this.recipients
      .createQueryBuilder('r')
      .where('r.broadcast_id = :id', { id });
    if (q.status) qb.andWhere('r.status = :st', { st: q.status });
    if (q.search)
      qb.andWhere('LOWER(r.email) LIKE :s', {
        s: `%${q.search.toLowerCase()}%`,
      });
    const [items, total] = await qb
      .orderBy('r.status', 'ASC')
      .addOrderBy('r.email', 'ASC')
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getManyAndCount();
    return {
      items,
      total,
      page: q.page,
      limit: q.limit,
      hasMore: q.page * q.limit < total,
    };
  }

  // ---- unsubscribes --------------------------------------------------------

  async unsubscribe(email: string, source: string) {
    const e = email.trim().toLowerCase();
    if (await this.unsubscribes.existsBy({ email: e })) return false;
    await this.unsubscribes.insert({ email: e, source });
    return true;
  }

  async resubscribe(email: string) {
    const res = await this.unsubscribes.delete({
      email: email.trim().toLowerCase(),
    });
    if (!res.affected)
      throw new NotFoundException('That address is not unsubscribed');
  }

  async listUnsubscribes(q: { page: number; limit: number; search?: string }) {
    const qb = this.unsubscribes.createQueryBuilder('u');
    if (q.search)
      qb.where('u.email LIKE :s', { s: `%${q.search.toLowerCase()}%` });
    const [items, total] = await qb
      .orderBy('u.createdAt', 'DESC')
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getManyAndCount();
    return {
      items,
      total,
      page: q.page,
      limit: q.limit,
      hasMore: q.page * q.limit < total,
    };
  }

  /** Recent sends, for the newsletter list's summary tiles. */
  async summary() {
    const since = new Date(Date.now() - 30 * DAY);
    const [sent30d, scheduled, drafts, unsubscribed] = await Promise.all([
      this.broadcasts.find({
        where: { status: 'sent', sentAt: MoreThanOrEqual(since) },
        select: { sentCount: true },
      }),
      this.broadcasts.countBy({ status: 'scheduled' }),
      this.broadcasts.countBy({ status: 'draft' }),
      this.unsubscribes.count(),
    ]);
    return {
      broadcastsSent30d: sent30d.length,
      emailsSent30d: sent30d.reduce((n, b) => n + b.sentCount, 0),
      scheduled,
      drafts,
      unsubscribed,
    };
  }
}

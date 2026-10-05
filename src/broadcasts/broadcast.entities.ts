import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

const isPostgres = process.env.DB_TYPE === 'postgres';
const timestamp = isPostgres ? 'timestamptz' : 'datetime';

/**
 * What the email is about. Maintenance notices are service messages: they
 * go to account holders even if they unsubscribed from newsletters.
 */
export const BROADCAST_KINDS = [
  'newsletter',
  'feature_update',
  'announcement',
  'maintenance',
  'direct',
] as const;
export type BroadcastKind = (typeof BROADCAST_KINDS)[number];

export const AUDIENCES = [
  'users_all',
  'users_onboarded',
  'users_students',
  'users_qualified',
  'users_inactive',
  'waitlist_pending',
  'waitlist_all',
  'everyone',
  'custom',
] as const;
export type Audience = (typeof AUDIENCES)[number];

/** draft → scheduled → sending → sent; cancel goes back to draft or to cancelled. */
export type BroadcastStatus =
  'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';

@Entity('broadcasts')
@Index('IDX_broadcasts_status_scheduled', ['status', 'scheduledAt'])
export class Broadcast {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_broadcasts_id',
  })
  id: string;

  @Column({ type: 'varchar', default: 'newsletter' }) kind: BroadcastKind;

  @Column({ type: 'varchar', default: '' }) subject: string;

  /** Inbox preview text after the subject. */
  @Column({ type: 'varchar', default: '' }) preheader: string;

  /** Big title at the top of the email; falls back to the subject. */
  @Column({ type: 'varchar', default: '' }) headline: string;

  /** Sanitised editor HTML. */
  @Column({ name: 'body_html', type: 'text', default: '' }) bodyHtml: string;

  @Column({ name: 'cta_label', type: 'varchar', nullable: true })
  ctaLabel: string | null;

  @Column({ name: 'cta_url', type: 'varchar', nullable: true })
  ctaUrl: string | null;

  @Column({ type: 'varchar', default: 'users_all' }) audience: Audience;

  /** Comma/space/newline separated list of email addresses when audience is 'custom'. */
  @Column({ name: 'custom_emails', type: 'text', nullable: true })
  customEmails: string | null;

  @Column({ type: 'varchar', default: 'draft' }) status: BroadcastStatus;

  @Column({ name: 'scheduled_at', type: timestamp, nullable: true })
  scheduledAt: Date | null;

  @Column({ name: 'started_at', type: timestamp, nullable: true })
  startedAt: Date | null;

  @Column({ name: 'sent_at', type: timestamp, nullable: true })
  sentAt: Date | null;

  /** Worker lease, so only one instance sends a broadcast at a time. */
  @Column({ name: 'locked_until', type: timestamp, nullable: true })
  lockedUntil: Date | null;

  @Column({ name: 'recipient_count', type: 'int', default: 0 })
  recipientCount: number;

  @Column({ name: 'sent_count', type: 'int', default: 0 }) sentCount: number;

  @Column({ name: 'failed_count', type: 'int', default: 0 })
  failedCount: number;

  /** Left out because they unsubscribed. */
  @Column({ name: 'suppressed_count', type: 'int', default: 0 })
  suppressedCount: number;

  @Column({ name: 'created_by', type: 'varchar' }) createdBy: string;

  @Column({ name: 'updated_by', type: 'varchar' }) updatedBy: string;

  @CreateDateColumn({ name: 'created_at', type: timestamp }) createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: timestamp }) updatedAt: Date;
}

/** `sending`: claimed into a batch whose result isn't recorded yet. */
export type RecipientStatus = 'pending' | 'sending' | 'sent' | 'failed';

/** Snapshot of who a broadcast goes to, taken when sending starts. */
@Entity('broadcast_recipients')
@Unique('UQ_broadcast_recipients_email', ['broadcast', 'email'])
@Index('IDX_broadcast_recipients_status', ['broadcast', 'status'])
export class BroadcastRecipient {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_broadcast_recipients_id',
  })
  id: string;

  @ManyToOne(() => Broadcast, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({
    name: 'broadcast_id',
    foreignKeyConstraintName: 'FK_broadcast_recipients_broadcast_id',
  })
  broadcast: Broadcast;

  @Column({ type: 'varchar' }) email: string;

  @Column({ type: 'varchar', nullable: true }) name: string | null;

  @Column({ type: 'varchar', default: 'pending' }) status: RecipientStatus;

  @Column({ type: 'varchar', nullable: true }) error: string | null;

  /**
   * Idempotency key of the batch this row was claimed into. An interrupted
   * batch is re-sent with the same rows and key, so Resend drops the repeat.
   */
  @Column({ name: 'batch_key', type: 'varchar', nullable: true })
  batchKey: string | null;

  /** Resend's email id. */
  @Column({ name: 'message_id', type: 'varchar', nullable: true })
  messageId: string | null;

  @Column({ name: 'sent_at', type: timestamp, nullable: true })
  sentAt: Date | null;
}

/** People who opted out of newsletters and updates. */
@Entity('email_unsubscribes')
export class EmailUnsubscribe {
  @PrimaryColumn({
    type: 'varchar',
    primaryKeyConstraintName: 'PK_email_unsubscribes_email',
  })
  email: string;

  /** `link` (the email footer), `one_click` (inbox button) or `admin`. */
  @Column({ type: 'varchar', default: 'link' }) source: string;

  @CreateDateColumn({ name: 'created_at', type: timestamp }) createdAt: Date;
}

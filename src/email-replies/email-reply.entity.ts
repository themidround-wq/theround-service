import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Broadcast } from '../broadcasts/broadcast.entities';
import { User } from '../users/user.entity';

const isPostgres = process.env.DB_TYPE === 'postgres';
const timestamp = isPostgres ? 'timestamptz' : 'datetime';

export type EmailReplyStatus = 'unread' | 'read' | 'archived';

@Entity('email_replies')
@Index('IDX_email_replies_status_created', ['status', 'createdAt'])
@Index('IDX_email_replies_from_email', ['fromEmail'])
export class EmailReply {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_email_replies_id',
  })
  id: string;

  /** Resend's inbound email ID. */
  @Column({ name: 'resend_email_id', type: 'varchar', nullable: true })
  resendEmailId: string | null;

  /** Message-ID header from original message. */
  @Column({ name: 'message_id', type: 'varchar', nullable: true })
  messageId: string | null;

  /** In-Reply-To header if this was a reply to an outgoing email. */
  @Column({ name: 'in_reply_to', type: 'varchar', nullable: true })
  inReplyTo: string | null;

  /** References header. */
  @Column({ type: 'text', nullable: true })
  references: string | null;

  @Column({ name: 'from_email', type: 'varchar' })
  fromEmail: string;

  @Column({ name: 'from_name', type: 'varchar', nullable: true })
  fromName: string | null;

  @Column({ name: 'to_email', type: 'varchar' })
  toEmail: string;

  @Column({ type: 'varchar', default: '' })
  subject: string;

  @Column({ name: 'body_text', type: 'text', default: '' })
  bodyText: string;

  @Column({ name: 'body_html', type: 'text', nullable: true })
  bodyHtml: string | null;

  /** Short text snippet for inbox list preview. */
  @Column({ type: 'varchar', length: 300, default: '' })
  snippet: string;

  @Column({ type: 'varchar', default: 'unread' })
  status: EmailReplyStatus;

  /** Matched app user, if sender has an account. */
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_email_replies_user_id',
  })
  user: User | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  /** Matched broadcast/newsletter, if this reply was to a broadcast. */
  @ManyToOne(() => Broadcast, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'broadcast_id',
    foreignKeyConstraintName: 'FK_email_replies_broadcast_id',
  })
  broadcast: Broadcast | null;

  @Column({ name: 'broadcast_id', type: 'uuid', nullable: true })
  broadcastId: string | null;

  /** Full JSON headers if available. */
  @Column({ type: 'text', nullable: true })
  headers: string | null;

  @Column({ name: 'last_replied_at', type: timestamp, nullable: true })
  lastRepliedAt: Date | null;

  @Column({ name: 'reply_count', type: 'int', default: 0 })
  replyCount: number;

  @OneToMany(() => EmailReplyMessage, (message) => message.reply, {
    cascade: true,
  })
  messages: EmailReplyMessage[];

  @CreateDateColumn({ name: 'created_at', type: timestamp })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: timestamp })
  updatedAt: Date;
}

@Entity('email_reply_messages')
export class EmailReplyMessage {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_email_reply_messages_id',
  })
  id: string;

  @ManyToOne(() => EmailReply, (reply) => reply.messages, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({
    name: 'reply_id',
    foreignKeyConstraintName: 'FK_email_reply_messages_reply_id',
  })
  reply: EmailReply;

  @Column({ name: 'reply_id', type: 'uuid' })
  replyId: string;

  /** 'admin' (response sent from dashboard) or 'user' (further inbound reply). */
  @Column({ name: 'sender_type', type: 'varchar', default: 'admin' })
  senderType: 'admin' | 'user';

  @Column({ name: 'sender_email', type: 'varchar' })
  senderEmail: string;

  @Column({ name: 'sender_name', type: 'varchar', nullable: true })
  senderName: string | null;

  @Column({ name: 'body_text', type: 'text', default: '' })
  bodyText: string;

  @Column({ name: 'body_html', type: 'text', nullable: true })
  bodyHtml: string | null;

  @Column({ name: 'resend_message_id', type: 'varchar', nullable: true })
  resendMessageId: string | null;

  @CreateDateColumn({ name: 'created_at', type: timestamp })
  createdAt: Date;
}

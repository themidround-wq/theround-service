import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

const isPostgres = process.env.DB_TYPE === 'postgres';
const timestamp = isPostgres ? 'timestamptz' : 'datetime';

/** owner > admin > viewer. Only owners manage the team. */
export const ADMIN_ROLES = ['viewer', 'admin', 'owner'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const roleAtLeast = (role: AdminRole, min: AdminRole) =>
  ADMIN_ROLES.indexOf(role) >= ADMIN_ROLES.indexOf(min);

/** Dashboard operators. Separate from app `users`, who sign in with Google. */
@Entity('admin_users')
@Unique('UQ_admin_users_email', ['email'])
export class AdminUser {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_admin_users_id',
  })
  id: string;

  @Column({ type: 'varchar' }) email: string;

  @Column({ type: 'varchar' }) name: string;

  @Column({ name: 'password_hash', type: 'varchar' }) passwordHash: string;

  @Column({ type: 'varchar', default: 'admin' }) role: AdminRole;

  @Column({ type: 'boolean', default: true }) active: boolean;

  @Column({ name: 'last_login_at', type: timestamp, nullable: true })
  lastLoginAt: Date | null;

  // ---- two-factor (TOTP) ----

  /** Encrypted base32 secret; set once 2FA is confirmed. */
  @Column({ name: 'totp_secret', type: 'varchar', nullable: true })
  totpSecret: string | null;

  /** Encrypted secret shown during setup, until the first code confirms it. */
  @Column({ name: 'totp_pending_secret', type: 'varchar', nullable: true })
  totpPendingSecret: string | null;

  @Column({ name: 'totp_enabled_at', type: timestamp, nullable: true })
  totpEnabledAt: Date | null;

  /** Last accepted time step, so a code can't be replayed. */
  @Column({ name: 'totp_last_step', type: 'int', nullable: true })
  totpLastStep: number | null;

  /** JSON array of sha256 hashes of unused recovery codes. */
  @Column({ name: 'totp_recovery_codes', type: 'text', nullable: true })
  totpRecoveryCodes: string | null;

  @CreateDateColumn({ name: 'created_at', type: timestamp }) createdAt: Date;
}

/**
 * One row per dashboard login. The JWT carries the session id, so logging
 * out (or an owner removing access) takes effect immediately.
 */
@Entity('admin_sessions')
@Index('IDX_admin_sessions_admin_revoked', ['admin', 'revokedAt'])
export class AdminSession {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_admin_sessions_id',
  })
  id: string;

  @ManyToOne(() => AdminUser, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({
    name: 'admin_id',
    foreignKeyConstraintName: 'FK_admin_sessions_admin_id',
  })
  admin: AdminUser;

  @Column({ type: 'varchar', nullable: true }) ip: string | null;

  @Column({ name: 'user_agent', type: 'varchar', nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: 'created_at', type: timestamp }) createdAt: Date;

  @Column({ name: 'last_seen_at', type: timestamp }) lastSeenAt: Date;

  @Column({ name: 'expires_at', type: timestamp }) expiresAt: Date;

  @Column({ name: 'revoked_at', type: timestamp, nullable: true })
  revokedAt: Date | null;
}

/** Append-only record of every admin write. */
@Entity('admin_audit_logs')
@Index('IDX_admin_audit_logs_created_at', ['createdAt'])
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_admin_audit_logs_id',
  })
  id: string;

  /** Kept as plain columns so the log survives an admin being deleted. */
  @Column({ name: 'admin_id', type: 'varchar', nullable: true })
  adminId: string | null;

  @Column({ name: 'admin_email', type: 'varchar' }) adminEmail: string;

  /** e.g. `waitlist.invite`, `user.suspend`, `settings.update`. */
  @Column({ type: 'varchar' }) action: string;

  @Column({ type: 'varchar', nullable: true }) target: string | null;

  /** JSON-encoded details. */
  @Column({ type: 'text', nullable: true }) details: string | null;

  @Column({ type: 'varchar', nullable: true }) ip: string | null;

  @CreateDateColumn({ name: 'created_at', type: timestamp }) createdAt: Date;
}

/** Single-use "forgot password" links. Only the token's hash is stored. */
@Entity('admin_password_resets')
@Index('IDX_admin_password_resets_admin', ['admin', 'createdAt'])
@Unique('UQ_admin_password_resets_token_hash', ['tokenHash'])
export class AdminPasswordReset {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_admin_password_resets_id',
  })
  id: string;

  @ManyToOne(() => AdminUser, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({
    name: 'admin_id',
    foreignKeyConstraintName: 'FK_admin_password_resets_admin_id',
  })
  admin: AdminUser;

  @Column({ name: 'token_hash', type: 'varchar' })
  tokenHash: string;

  @Column({ name: 'expires_at', type: timestamp }) expiresAt: Date;

  @Column({ name: 'used_at', type: timestamp, nullable: true })
  usedAt: Date | null;

  @Column({ type: 'varchar', nullable: true }) ip: string | null;

  @CreateDateColumn({ name: 'created_at', type: timestamp }) createdAt: Date;
}

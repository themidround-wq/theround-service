import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Runtime switches an admin can flip without a deploy. Each key's value is
 * stored as JSON; unknown or missing keys fall back to `default`.
 */
export const SETTINGS = {
  'waitlist.open': {
    type: 'boolean',
    default: true,
    label: 'Accept waitlist signups',
    description:
      'When off, POST /api/waitlist rejects new emails (existing ones still get their ticket).',
  },
  'signups.open': {
    type: 'boolean',
    default: true,
    label: 'Allow new accounts',
    description:
      'When off, first-time Google sign-ins are refused. Existing users can still sign in.',
  },
  'practice.defaultResponseSeconds': {
    type: 'number',
    options: [90, 240],
    default: 90,
    label: 'Default response time for new users',
    description: '90 = Quick, 240 = Case. Users can change their own later.',
  },
  'email.waitlistConfirmation': {
    type: 'boolean',
    default: true,
    label: 'Waitlist confirmation email',
    description: 'Sent when a new email joins the waitlist.',
  },
  'email.welcome': {
    type: 'boolean',
    default: true,
    label: 'Welcome email',
    description: "Sent on a user's first sign-in.",
  },
  'email.progress': {
    type: 'boolean',
    default: true,
    label: 'Progress emails',
    description: 'First saved round and milestone (5, 10, 25, 50, 100) emails.',
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> =
  (typeof SETTINGS)[K]['type'] extends 'boolean' ? boolean : number;
export type SettingsMap = { [K in SettingKey]: SettingValue<K> };

export type BooleanSettingKey = {
  [K in SettingKey]: (typeof SETTINGS)[K]['type'] extends 'boolean' ? K : never;
}[SettingKey];

export const isSettingKey = (k: string): k is SettingKey => k in SETTINGS;

const isPostgres = process.env.DB_TYPE === 'postgres';

@Entity('app_settings')
export class AppSetting {
  @PrimaryColumn({
    type: 'varchar',
    primaryKeyConstraintName: 'PK_app_settings_key',
  })
  key: string;

  /** JSON-encoded value. */
  @Column({ type: 'text' }) value: string;

  @UpdateDateColumn({
    name: 'updated_at',
    type: isPostgres ? 'timestamptz' : 'datetime',
  })
  updatedAt: Date;

  @Column({ name: 'updated_by', type: 'varchar', nullable: true })
  updatedBy: string | null;
}

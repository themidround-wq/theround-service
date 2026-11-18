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
  'ai.marking': {
    type: 'boolean',
    default: false,
    label: 'AI marking',
    description:
      'Transcribe each practice answer and mark it with Claude against the question rubric. When off (or keys are missing), the placeholder scorer is used.',
  },
  'ai.transcription': {
    type: 'string',
    options: ['deepgram', 'assemblyai', 'whisper'],
    optionLabels: {
      deepgram: 'Deepgram',
      assemblyai: 'AssemblyAI',
      whisper: 'Whisper (open source)',
    },
    default: 'whisper',
    label: 'Speech-to-text provider',
    description:
      'Which service turns recordings into transcripts. Switch to compare accuracy on real answers.',
  },
  'ai.markingModel': {
    type: 'string',
    options: ['open', 'claude-haiku-5-5', 'claude-opus-5-5'],
    optionLabels: {
      open: 'Open-source model',
      'claude-haiku-5-5': 'Claude Haiku 5.5',
      'claude-opus-5-5': 'Claude Opus 5.5',
    },
    default: 'open',
    label: 'Marking model',
    description:
      'Open source: the model at OPEN_MODEL_BASE_URL (cheapest, self-hosted or Groq/Together). Claude Haiku 5.5: low cost. Claude Opus 5.5: best judgement (about 3¢ per answer).',
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> =
  (typeof SETTINGS)[K]['type'] extends 'boolean'
    ? boolean
    : (typeof SETTINGS)[K]['type'] extends 'string'
      ? string
      : number;
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

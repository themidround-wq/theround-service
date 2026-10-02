import { ApiProperty } from '@nestjs/swagger';
import { ADMIN_ROLES } from './admin.entities';
import { AUDIENCES, BROADCAST_KINDS } from '../broadcasts/broadcast.entities';
import {
  IdName,
  QuestionResponse,
  RoundResponse,
  StatsResponse,
  UserResponse,
} from '../common/api.response';

/** Admin API response shapes, used only to document the API in Swagger. */

const BROADCAST_STATUSES = [
  'draft',
  'scheduled',
  'sending',
  'sent',
  'cancelled',
] as const;
const RECIPIENT_STATUSES = ['pending', 'sending', 'sent', 'failed'] as const;

// ---- auth & account ----------------------------------------------------------

export class AdminResponse {
  @ApiProperty({ example: '0b5c2f0e-3a51-4c8e-9d2f-1e7a6b4c3d21' })
  id: string;
  @ApiProperty({ example: 'founder@gettheround.com' })
  email: string;
  @ApiProperty({ example: 'Ani' })
  name: string;
  @ApiProperty({ enum: ADMIN_ROLES, example: 'owner' })
  role: string;
  /** Deactivated admins can't sign in. */
  @ApiProperty({ example: true })
  active: boolean;
  @ApiProperty({
    nullable: true,
    type: Date,
    example: '2026-10-02T09:00:00.000Z',
  })
  lastLoginAt: Date | null;
  @ApiProperty({ example: '2026-10-01T12:00:00.000Z' })
  createdAt: Date;
  @ApiProperty({ example: false })
  twoFactorEnabled: boolean;
}

/**
 * Either a session (`twoFactorRequired: false`) or, when 2FA is on, a
 * challenge to send to POST /admin/auth/login/2fa.
 */
export class AdminLoginResponse {
  @ApiProperty({ example: false })
  twoFactorRequired: boolean;
  /** Only when twoFactorRequired is false. Send as `Authorization: Bearer <accessToken>`. */
  @ApiProperty({
    required: false,
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJhZG1pbiJ9.sig',
  })
  accessToken?: string;
  /** Only when twoFactorRequired is false. Sessions last 12 hours. */
  @ApiProperty({ required: false, example: '2026-10-02T21:00:00.000Z' })
  expiresAt?: Date;
  /** Only when twoFactorRequired is false. */
  @ApiProperty({ required: false, type: AdminResponse })
  admin?: AdminResponse;
  /** Only when twoFactorRequired is true. Valid for 5 minutes. */
  @ApiProperty({
    required: false,
    example: 'eyJhbGciOiJIUzI1NiJ9.eyJ0eXAiOiJhZG1pbl8yZmEifQ.sig',
  })
  challengeToken?: string;
}

/** Returned by POST /admin/auth/login/2fa. */
export class AdminSessionResponse {
  @ApiProperty({ example: false })
  twoFactorRequired: boolean;
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJhZG1pbiJ9.sig',
  })
  accessToken: string;
  @ApiProperty({ example: '2026-10-02T21:00:00.000Z' })
  expiresAt: Date;
  @ApiProperty({ type: AdminResponse })
  admin: AdminResponse;
}

export class PasswordResetResponse {
  @ApiProperty({ example: 'founder@gettheround.com' })
  email: string;
  /** If true, the sign-in page should expect a code after the password. */
  @ApiProperty({ example: true })
  twoFactorEnabled: boolean;
}

export class AdminSessionInfoResponse {
  @ApiProperty({ example: '7c1d9e2a-4b3f-4a6e-8d5c-2f1e0a9b8c7d' })
  id: string;
  @ApiProperty({ nullable: true, type: String, example: '102.89.34.12' })
  ip: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    example: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) …',
  })
  userAgent: string | null;
  @ApiProperty({ example: '2026-10-02T09:00:00.000Z' })
  createdAt: Date;
  @ApiProperty({ example: '2026-10-02T11:42:00.000Z' })
  lastSeenAt: Date;
  @ApiProperty({ example: '2026-10-02T21:00:00.000Z' })
  expiresAt: Date;
  /** The session making this request. */
  @ApiProperty({ example: true })
  current: boolean;
}

// ---- overview & activity -----------------------------------------------------

export class OverviewKpis {
  @ApiProperty({ example: 412 }) waitlistTotal: number;
  @ApiProperty({ example: 6 }) waitlistToday: number;
  @ApiProperty({ example: 38 }) waitlistThisWeek: number;
  @ApiProperty({ example: 29 }) waitlistLastWeek: number;
  /** Waitlist emails that now have an account. */
  @ApiProperty({ example: 57 }) waitlistConverted: number;
  @ApiProperty({ example: 88 }) usersTotal: number;
  @ApiProperty({ example: 12 }) usersThisWeek: number;
  @ApiProperty({ example: 9 }) usersLastWeek: number;
  @ApiProperty({ example: 71 }) onboarded: number;
  @ApiProperty({ example: 1 }) suspended: number;
  @ApiProperty({ example: 640 }) roundsSaved: number;
  @ApiProperty({ example: 94 }) roundsThisWeek: number;
  @ApiProperty({ example: 81 }) roundsLastWeek: number;
  @ApiProperty({ example: 51840 }) speakingSeconds: number;
  /** Users with a saved round in the last 7 days. */
  @ApiProperty({ example: 34 }) activeUsers7d: number;
}

export class OverviewDay {
  @ApiProperty({ example: '2026-10-02' }) date: string;
  @ApiProperty({ example: 6 }) waitlist: number;
  @ApiProperty({ example: 2 }) users: number;
  @ApiProperty({ example: 15 }) rounds: number;
}

export class AdminWaitlistEntryResponse {
  @ApiProperty({ example: 27 }) id: number;
  @ApiProperty({ example: 1027 }) ticketNumber: number;
  @ApiProperty({ example: 'nkem@example.com' }) email: string;
  @ApiProperty({ example: '2026-09-20T08:15:00.000Z' }) createdAt: Date;
  @ApiProperty({
    nullable: true,
    type: Date,
    example: '2026-10-01T10:00:00.000Z',
  })
  invitedAt: Date | null;
  /** Set once this email has an account. */
  @ApiProperty({ nullable: true, type: String, example: null })
  userId: string | null;
  @ApiProperty({ enum: ['pending', 'invited', 'joined'], example: 'invited' })
  status: string;
}

export class AdminUserResponse extends UserResponse {
  @ApiProperty({ nullable: true, type: Date, example: null })
  suspendedAt: Date | null;
  @ApiProperty({ example: '2026-09-25T14:30:00.000Z' }) createdAt: Date;
  @ApiProperty({ example: '2026-10-01T09:12:00.000Z' }) updatedAt: Date;
}

export class AdminUserListItem extends AdminUserResponse {
  @ApiProperty({ example: 14 }) roundsSaved: number;
  @ApiProperty({
    nullable: true,
    type: Date,
    example: '2026-10-01T21:10:00.000Z',
  })
  lastRoundAt: Date | null;
}

export class OverviewResponse {
  @ApiProperty({ type: OverviewKpis }) kpis: OverviewKpis;
  /** One entry per UTC day in the range, oldest first. */
  @ApiProperty({ type: [OverviewDay] }) series: OverviewDay[];
  /** The 6 newest waitlist entries. */
  @ApiProperty({ type: [AdminWaitlistEntryResponse] })
  recentWaitlist: AdminWaitlistEntryResponse[];
  /** The 6 newest users. */
  @ApiProperty({ type: [AdminUserListItem] })
  recentUsers: AdminUserListItem[];
}

export class ActivityFunnel {
  @ApiProperty({ example: 220 }) spun: number;
  @ApiProperty({ example: 180 }) started: number;
  @ApiProperty({ example: 150 }) completed: number;
  @ApiProperty({ example: 132 }) saved: number;
}

export class ActivityLength {
  @ApiProperty({ example: 98 }) quick: number;
  @ApiProperty({ example: 34 }) case: number;
}

export class ActivityCategory extends IdName {
  @ApiProperty({ example: 41 }) rounds: number;
}

export class ActivityDay {
  @ApiProperty({ example: '2026-10-02' }) date: string;
  @ApiProperty({ example: 15 }) rounds: number;
  @ApiProperty({ example: 9 }) activeUsers: number;
}

export class ActivityResponse {
  /** Rounds started in the range, by how far they got. */
  @ApiProperty({ type: ActivityFunnel }) funnel: ActivityFunnel;
  /** Saved rounds per reflection; `none` when the user skipped it. */
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { clear: 60, unsure: 40, none: 32 },
  })
  reflections: Record<string, number>;
  /** Saved rounds by response length. */
  @ApiProperty({ type: ActivityLength }) length: ActivityLength;
  @ApiProperty({ example: 78 }) avgSpokenSeconds: number;
  /** Users with at least one saved round in the range. */
  @ApiProperty({ example: 46 }) practisingUsers: number;
  /** Every category in wheel order, with saved rounds in the range. */
  @ApiProperty({ type: [ActivityCategory] }) categories: ActivityCategory[];
  @ApiProperty({ type: [ActivityDay] }) series: ActivityDay[];
}

// ---- waitlist ------------------------------------------------------------------

export class AdminWaitlistListResponse {
  @ApiProperty({ type: [AdminWaitlistEntryResponse] })
  items: AdminWaitlistEntryResponse[];
  @ApiProperty({ example: 412 }) total: number;
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 25 }) limit: number;
  @ApiProperty({ example: true }) hasMore: boolean;
}

export class AddWaitlistResponse {
  @ApiProperty({ example: 3 }) added: number;
  /** Already on the list. */
  @ApiProperty({ example: 1 }) skipped: number;
}

export class InviteWaitlistResponse {
  @ApiProperty({ example: 10 }) sent: number;
  /** Already have an account. */
  @ApiProperty({ example: 2 }) skipped: number;
  @ApiProperty({ example: 0 }) failed: number;
  /** True when email isn't configured on the API, so nothing was sent. */
  @ApiProperty({ example: false }) emailDisabled: boolean;
}

// ---- users & rounds ------------------------------------------------------------

export class AdminUserListResponse {
  @ApiProperty({ type: [AdminUserListItem] }) items: AdminUserListItem[];
  @ApiProperty({ example: 88 }) total: number;
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 25 }) limit: number;
  @ApiProperty({ example: true }) hasMore: boolean;
}

export class RoundUserResponse {
  @ApiProperty({ example: '3f2b8c1e-7a4d-4e2b-9c1a-5d6e7f8a9b0c' }) id: string;
  @ApiProperty({ example: 'nkem@example.com' }) email: string;
  @ApiProperty({ nullable: true, type: String, example: 'Nkem' })
  name: string | null;
}

export class AdminRoundResponse extends RoundResponse {
  @ApiProperty({
    nullable: true,
    type: Date,
    example: '2026-09-30T21:55:02.000Z',
  })
  startedAt: Date | null;
  @ApiProperty({
    nullable: true,
    type: Date,
    example: '2026-09-30T21:56:30.000Z',
  })
  completedAt: Date | null;
  @ApiProperty({ type: RoundUserResponse }) user: RoundUserResponse;
}

export class AdminRoundListResponse {
  @ApiProperty({ type: [AdminRoundResponse] }) items: AdminRoundResponse[];
  @ApiProperty({ example: 640 }) total: number;
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 25 }) limit: number;
  @ApiProperty({ example: true }) hasMore: boolean;
}

export class UserWaitlistInfo {
  @ApiProperty({ example: 1027 }) ticketNumber: number;
  @ApiProperty({ example: '2026-09-20T08:15:00.000Z' }) joinedAt: Date;
}

export class AdminUserDetailResponse {
  @ApiProperty({ type: AdminUserResponse }) user: AdminUserResponse;
  @ApiProperty({ type: StatsResponse }) stats: StatsResponse;
  /** Their 20 most recent rounds. */
  @ApiProperty({ type: AdminRoundListResponse }) rounds: AdminRoundListResponse;
  /** Null when they signed up without joining the waitlist. */
  @ApiProperty({ nullable: true, type: UserWaitlistInfo })
  waitlist: UserWaitlistInfo | null;
}

// ---- catalog -------------------------------------------------------------------

export class AdminQuestionResponse extends QuestionResponse {
  /** Saved rounds on this question. */
  @ApiProperty({ example: 7 }) rounds: number;
}

export class AdminTopicResponse extends IdName {
  @ApiProperty({ example: 18 }) rounds: number;
  @ApiProperty({ type: [AdminQuestionResponse] })
  questions: AdminQuestionResponse[];
}

export class CategoryResponse extends IdName {
  /** Position on the wheel, from 0. */
  @ApiProperty({ example: 0 }) sortOrder: number;
  /** Hidden categories never appear on the wheel. */
  @ApiProperty({ example: true }) active: boolean;
}

export class AdminCategoryResponse extends CategoryResponse {
  /** On the wheel: active and at least one topic has a question. */
  @ApiProperty({ example: true }) playable: boolean;
  @ApiProperty({ example: 41 }) rounds: number;
  /** Sorted by name. */
  @ApiProperty({ type: [AdminTopicResponse] }) topics: AdminTopicResponse[];
}

// ---- settings, audit, team -----------------------------------------------------

export class SettingResponse {
  @ApiProperty({ example: 'waitlist.open' }) key: string;
  @ApiProperty({ enum: ['boolean', 'number'], example: 'boolean' })
  type: string;
  @ApiProperty({
    oneOf: [{ type: 'boolean' }, { type: 'number' }],
    example: true,
  })
  default: boolean | number;
  /** Allowed values, for number settings with a fixed set. */
  @ApiProperty({ required: false, type: [Number], example: [90, 240] })
  options?: number[];
  @ApiProperty({ example: 'Accept waitlist signups' }) label: string;
  @ApiProperty({
    example:
      'When off, POST /api/waitlist rejects new emails (existing ones still get their ticket).',
  })
  description: string;
  @ApiProperty({
    oneOf: [{ type: 'boolean' }, { type: 'number' }],
    example: false,
  })
  value: boolean | number;
  /** Null while the setting is still at its default. */
  @ApiProperty({
    nullable: true,
    type: Date,
    example: '2026-10-02T09:00:00.000Z',
  })
  updatedAt: Date | null;
  @ApiProperty({
    nullable: true,
    type: String,
    example: 'founder@gettheround.com',
  })
  updatedBy: string | null;
}

export class AuditEntryResponse {
  @ApiProperty({ example: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d' }) id: string;
  /** Null once that admin has been removed. */
  @ApiProperty({ nullable: true, type: String })
  adminId: string | null;
  @ApiProperty({ example: 'founder@gettheround.com' }) adminEmail: string;
  @ApiProperty({ example: 'waitlist.invite' }) action: string;
  @ApiProperty({ nullable: true, type: String, example: 'nkem@example.com' })
  target: string | null;
  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    example: { sent: 10, skipped: 2 },
  })
  details: Record<string, unknown> | null;
  @ApiProperty({ nullable: true, type: String, example: '102.89.34.12' })
  ip: string | null;
  @ApiProperty({ example: '2026-10-02T09:00:00.000Z' }) createdAt: Date;
}

export class AuditListResponse {
  @ApiProperty({ type: [AuditEntryResponse] }) items: AuditEntryResponse[];
  @ApiProperty({ example: 230 }) total: number;
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 25 }) limit: number;
  @ApiProperty({ example: true }) hasMore: boolean;
}

// ---- newsletters ---------------------------------------------------------------

export class BroadcastListItem {
  @ApiProperty({ example: 'c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f' }) id: string;
  @ApiProperty({ enum: BROADCAST_KINDS, example: 'newsletter' }) kind: string;
  @ApiProperty({ example: 'What’s new in The Round this month' })
  subject: string;
  @ApiProperty({ enum: AUDIENCES, example: 'users_all' }) audience: string;
  @ApiProperty({ enum: BROADCAST_STATUSES, example: 'sent' }) status: string;
  @ApiProperty({ nullable: true, type: Date, example: null })
  scheduledAt: Date | null;
  @ApiProperty({
    nullable: true,
    type: Date,
    example: '2026-10-01T10:00:00.000Z',
  })
  startedAt: Date | null;
  @ApiProperty({
    nullable: true,
    type: Date,
    example: '2026-10-01T10:04:00.000Z',
  })
  sentAt: Date | null;
  /** Fixed when sending starts. */
  @ApiProperty({ example: 88 }) recipientCount: number;
  @ApiProperty({ example: 86 }) sentCount: number;
  @ApiProperty({ example: 2 }) failedCount: number;
  /** Left out because they unsubscribed. */
  @ApiProperty({ example: 3 }) suppressedCount: number;
  @ApiProperty({ example: 'founder@gettheround.com' }) createdBy: string;
  @ApiProperty({ example: 'founder@gettheround.com' }) updatedBy: string;
  @ApiProperty({ example: '2026-09-29T16:00:00.000Z' }) createdAt: Date;
  @ApiProperty({ example: '2026-10-01T10:04:00.000Z' }) updatedAt: Date;
}

export class BroadcastResponse extends BroadcastListItem {
  @ApiProperty({ example: 'Three new topics and a faster wheel.' })
  preheader: string;
  /** Title inside the email; empty means the subject is used. */
  @ApiProperty({ example: '' }) headline: string;
  /** Sanitised editor HTML. */
  @ApiProperty({ example: '<p>Hi {{name}}, here’s what’s new…</p>' })
  bodyHtml: string;
  @ApiProperty({ nullable: true, type: String, example: 'Open The Round' })
  ctaLabel: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    example: 'https://app.gettheround.com',
  })
  ctaUrl: string | null;
  /** Worker lease while sending; null otherwise. */
  @ApiProperty({ nullable: true, type: Date, example: null })
  lockedUntil: Date | null;
}

export class BroadcastListResponse {
  @ApiProperty({ type: [BroadcastListItem] }) items: BroadcastListItem[];
  @ApiProperty({ example: 14 }) total: number;
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 25 }) limit: number;
  @ApiProperty({ example: false }) hasMore: boolean;
}

export class BroadcastSummaryResponse {
  @ApiProperty({ example: 3 }) broadcastsSent30d: number;
  @ApiProperty({ example: 264 }) emailsSent30d: number;
  @ApiProperty({ example: 1 }) scheduled: number;
  @ApiProperty({ example: 2 }) drafts: number;
  /** Everyone currently unsubscribed. */
  @ApiProperty({ example: 9 }) unsubscribed: number;
}

export class AudienceResponse {
  @ApiProperty({ enum: AUDIENCES, example: 'users_all' }) key: string;
  @ApiProperty({ example: 'All users' }) label: string;
  @ApiProperty({ example: 'Everyone with an account (not suspended).' })
  description: string;
  /** App users only, so it can receive maintenance notices. */
  @ApiProperty({ example: true }) users: boolean;
  /** Who would get it right now, after removing unsubscribes. */
  @ApiProperty({ example: 85 }) count: number;
  @ApiProperty({ example: 3 }) suppressed: number;
}

export class RenderedEmailResponse {
  @ApiProperty({ example: 'What’s new in The Round this month' })
  subject: string;
  @ApiProperty({ example: '<!doctype html><html>…</html>' }) html: string;
  @ApiProperty({ example: 'Hi Ani, here’s what’s new…' }) text: string;
}

export class BroadcastRecipientResponse {
  @ApiProperty({ example: 'd4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f7a' }) id: string;
  @ApiProperty({ example: 'nkem@example.com' }) email: string;
  @ApiProperty({ nullable: true, type: String, example: 'Nkem' })
  name: string | null;
  @ApiProperty({ enum: RECIPIENT_STATUSES, example: 'sent' }) status: string;
  @ApiProperty({ nullable: true, type: String, example: null })
  error: string | null;
  @ApiProperty({ nullable: true, type: String })
  batchKey: string | null;
  /** Resend's email id. */
  @ApiProperty({ nullable: true, type: String })
  messageId: string | null;
  @ApiProperty({
    nullable: true,
    type: Date,
    example: '2026-10-01T10:01:00.000Z',
  })
  sentAt: Date | null;
}

export class BroadcastRecipientListResponse {
  @ApiProperty({ type: [BroadcastRecipientResponse] })
  items: BroadcastRecipientResponse[];
  @ApiProperty({ example: 88 }) total: number;
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 25 }) limit: number;
  @ApiProperty({ example: true }) hasMore: boolean;
}

export class TestSendResponse {
  @ApiProperty({ example: 1 }) sent: number;
}

export class RetryResponse {
  /** Failed recipients put back in the queue. */
  @ApiProperty({ example: 2 }) retrying: number;
}

export class UnsubscribeResponse {
  @ApiProperty({ example: 'nkem@example.com' }) email: string;
  @ApiProperty({ enum: ['link', 'one_click', 'admin'], example: 'link' })
  source: string;
  @ApiProperty({ example: '2026-10-01T12:00:00.000Z' }) createdAt: Date;
}

export class UnsubscribeListResponse {
  @ApiProperty({ type: [UnsubscribeResponse] }) items: UnsubscribeResponse[];
  @ApiProperty({ example: 9 }) total: number;
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 25 }) limit: number;
  @ApiProperty({ example: false }) hasMore: boolean;
}

export class AddUnsubscribeResponse {
  /** False when the address was already unsubscribed. */
  @ApiProperty({ example: true }) added: boolean;
}

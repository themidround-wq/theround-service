import { ApiProperty } from '@nestjs/swagger';
import { GOALS, RESPONSE_SECONDS, STAGES } from '../users/user.entity';
import { REFLECTIONS } from '../rounds/round.entity';

/** Response shapes, used only to document the API in Swagger. */

export class UserResponse {
  @ApiProperty({ example: '3f2b8c1e-7a4d-4e2b-9c1a-5d6e7f8a9b0c' })
  id: string;
  @ApiProperty({ example: 'nkem@example.com' })
  email: string;
  /** Prefilled from Google's first name; editable in onboarding. */
  @ApiProperty({ nullable: true, type: String, example: 'Nkem' })
  name: string | null;
  /** Google profile photo. */
  @ApiProperty({
    nullable: true,
    type: String,
    example: 'https://lh3.googleusercontent.com/a/abc123',
  })
  pictureUrl: string | null;
  /** Preset avatar chosen in onboarding (1-8). */
  @ApiProperty({
    nullable: true,
    type: Number,
    minimum: 1,
    maximum: 8,
    example: 4,
  })
  avatarId: number | null;
  @ApiProperty({ nullable: true, enum: STAGES, example: 'student' })
  stage: string | null;
  @ApiProperty({ nullable: true, type: String, example: 'Midwifery' })
  course: string | null;
  @ApiProperty({ nullable: true, type: String, example: 'Year 2' })
  year: string | null;
  @ApiProperty({ nullable: true, type: String, example: 'Semester 1' })
  semester: string | null;
  @ApiProperty({ nullable: true, enum: GOALS, example: 'build_confidence' })
  goal: string | null;
  @ApiProperty({ enum: RESPONSE_SECONDS, example: 90 })
  defaultResponseSeconds: number;
  @ApiProperty({ example: true })
  soundCues: boolean;
  /** False until name, stage, avatar and goal are all set. */
  @ApiProperty({ example: false })
  onboarded: boolean;
}

export class LoginResponse {
  /** Send as `Authorization: Bearer <accessToken>`. */
  @ApiProperty({
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzZjJiOGMxZSJ9.sig',
  })
  accessToken: string;
  /** True on the account's first sign-in. */
  @ApiProperty({ example: true })
  isNewUser: boolean;
  user: UserResponse;
}

export class MostPractisedResponse {
  @ApiProperty({ example: 'Labour & Delivery' })
  category: string;
  @ApiProperty({ example: 4 })
  rounds: number;
}

export class StatsResponse {
  @ApiProperty({ example: 12 })
  totalRounds: number;
  @ApiProperty({ example: 4 })
  roundsThisWeek: number;
  @ApiProperty({ example: 2160 })
  speakingSeconds: number;
  @ApiProperty({ nullable: true, type: MostPractisedResponse })
  mostPractised: MostPractisedResponse | null;
  /** Consecutive UTC days with a saved round, ending today or yesterday. */
  @ApiProperty({ example: 4 })
  currentStreakDays: number;
}

export class MeResponse {
  user: UserResponse;
  stats: StatsResponse;
}

export class IdName {
  @ApiProperty({ example: '4663e1a3-7290-4027-8896-3f5bedef5222' })
  id: string;
  @ApiProperty({ example: 'Labour & Delivery' })
  name: string;
}

export class QuestionResponse {
  @ApiProperty({ example: '5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9' })
  id: string;
  @ApiProperty({
    example: 'How would you recognise and manage a postpartum haemorrhage?',
  })
  text: string;
}

export class CatalogResponse {
  /** Wheel segments, in display order. */
  @ApiProperty({ type: [IdName] }) categories: IdName[];
  /** The "24 reviewed topics" counter. */
  @ApiProperty({ example: 24 })
  topicCount: number;
}

export class RoundResponse {
  @ApiProperty({ example: '1d922377-9351-42e0-9812-61f7d1c19629' })
  id: string;
  @ApiProperty({
    enum: ['spun', 'in_progress', 'completed', 'saved'],
    example: 'saved',
  })
  status: string;
  category: IdName;
  topic: IdName;
  question: QuestionResponse;
  /** Time allowed: 90 (Quick) or 240 (Case). */
  @ApiProperty({ example: 90 })
  durationSeconds: number;
  @ApiProperty({ enum: ['quick', 'case'], example: 'quick' })
  responseType: string;
  @ApiProperty({ nullable: true, type: Number, example: 84 })
  spokenSeconds: number | null;
  @ApiProperty({ example: true })
  hasAudio: boolean;
  @ApiProperty({ nullable: true, enum: REFLECTIONS, example: 'clear' })
  reflection: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    example:
      'I kept the structure clear. Next time I want to mention escalation earlier.',
  })
  note: string | null;
  @ApiProperty({ example: true })
  bookmarked: boolean;
  @ApiProperty({ example: '2026-09-30T21:54:31.000Z' })
  createdAt: Date;
  @ApiProperty({
    nullable: true,
    type: Date,
    example: '2026-09-30T22:03:10.000Z',
  })
  savedAt: Date | null;
}

export class RoundListResponse {
  @ApiProperty({ type: [RoundResponse] }) items: RoundResponse[];
  @ApiProperty({ example: 12 })
  total: number;
  @ApiProperty({ example: 1 })
  page: number;
  @ApiProperty({ example: 10 })
  limit: number;
  @ApiProperty({ example: true })
  hasMore: boolean;
}

export class AudioUrlResponse {
  /** Signed URL; use directly as `<audio src>`. */
  @ApiProperty({
    example:
      'https://<account>.r2.cloudflarestorage.com/theround-audio/<userId>/<roundId>.webm?X-Amz-Signature=…',
  })
  url: string;
  @ApiProperty({ example: 900 })
  expiresInSeconds: number;
}

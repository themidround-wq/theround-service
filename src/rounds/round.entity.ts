import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Category, Question, Topic } from '../catalog/catalog.entities';
import { PracticeSession } from '../practice/practice-session.entity';
import { User } from '../users/user.entity';

/** spun -> in_progress -> completed -> saved (history only lists saved). */
export type RoundStatus = 'spun' | 'in_progress' | 'completed' | 'saved';

export const REFLECTIONS = [
  'clear',
  'a_little_unsure',
  'lost_my_structure',
  'want_another_go',
] as const;
export type Reflection = (typeof REFLECTIONS)[number];

@Entity('rounds')
@Index(['user', 'status', 'savedAt'])
export class Round {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false }) user: User;
  @ManyToOne(() => Category, { eager: true, nullable: false })
  category: Category;
  @ManyToOne(() => Topic, { eager: true, nullable: false }) topic: Topic;
  @ManyToOne(() => Question, { eager: true, nullable: false })
  question: Question;

  @Column({ type: 'varchar', default: 'spun' }) status: RoundStatus;

  /** Time allowed: 90 (Quick) or 240 (Case). */
  @Column({ type: 'int' }) durationSeconds: number;

  @Column({ type: 'int', nullable: true }) spokenSeconds: number | null;
  @Column({ type: 'varchar', nullable: true }) audioKey: string | null;
  @Column({ type: 'varchar', nullable: true }) audioMime: string | null;

  @Column({ type: 'varchar', nullable: true }) reflection: Reflection | null;
  @Column({ type: 'text', nullable: true }) note: string | null;
  @Column({ type: 'boolean', default: false }) bookmarked: boolean;

  // ---- practice sessions (chat-style app); null for classic wheel rounds ----

  @ManyToOne(() => PracticeSession, (s) => s.rounds, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  session: PracticeSession | null;
  /** Same question again after feedback ("Try again"). */
  @Column({ type: 'boolean', default: false }) retake: boolean;
  /** The user's chat line that started this round. */
  @Column({ type: 'varchar', nullable: true }) prompt: string | null;
  /** The assistant line above the question card. */
  @Column({ type: 'varchar', nullable: true }) intro: string | null;
  /** 0-100, set when feedback is generated. */
  @Column({ type: 'int', nullable: true }) score: number | null;
  /** Feedback JSON (see practice/feedback.ts). */
  @Column({ type: 'simple-json', nullable: true })
  feedback: Record<string, unknown> | null;
  /** Speech-to-text of the answer (AI marking only). */
  @Column({ type: 'text', nullable: true }) transcript: string | null;
  /** 'ai' or 'placeholder'. */
  @Column({ type: 'varchar', nullable: true }) feedbackSource: string | null;
  /** Providers, models, tokens, estimated cost, timings, any fallback error. */
  @Column({ type: 'simple-json', nullable: true })
  markingMeta: Record<string, unknown> | null;
  /** Set when an admin flags the feedback as wrong or unhelpful. */
  @Column({ type: Date, nullable: true }) flaggedAt: Date | null;
  @Column({ type: 'varchar', nullable: true }) flagNote: string | null;

  @CreateDateColumn() createdAt: Date;
  @Column({ type: Date, nullable: true }) startedAt: Date | null;
  @Column({ type: Date, nullable: true }) completedAt: Date | null;
  @Column({ type: Date, nullable: true }) savedAt: Date | null;
}

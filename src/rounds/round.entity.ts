import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Category, Question, Topic } from '../catalog/catalog.entities';
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

  @CreateDateColumn() createdAt: Date;
  @Column({ type: Date, nullable: true }) startedAt: Date | null;
  @Column({ type: Date, nullable: true }) completedAt: Date | null;
  @Column({ type: Date, nullable: true }) savedAt: Date | null;
}

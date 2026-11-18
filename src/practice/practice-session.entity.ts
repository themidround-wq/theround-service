import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Round } from '../rounds/round.entity';
import { User } from '../users/user.entity';

/**
 * A chat-style practice session in the app: a titled thread of rounds.
 * Deleting is soft (deletedAt) so the app can offer "Undo"; restored sessions
 * keep their rounds and audio.
 */
@Entity('practice_sessions')
@Index(['user', 'deletedAt', 'createdAt'])
export class PracticeSession {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false }) user: User;

  @Column() title: string;

  /** Category slug of the first round ("labour", "newborn"…), for the sidebar icon. */
  @Column() categorySlug: string;

  /** True after "Change topic": the app shows the topic picker at the end. */
  @Column({ type: 'boolean', default: false }) pickingTopic: boolean;

  @OneToMany(() => Round, (r) => r.session) rounds: Round[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
  @Column({ type: Date, nullable: true }) deletedAt: Date | null;
}

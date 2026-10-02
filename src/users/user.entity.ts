import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const STAGES = ['student', 'qualified'] as const;
export type Stage = (typeof STAGES)[number];

export const GOALS = ['build_confidence', 'prepare_for_exams'] as const;
export type Goal = (typeof GOALS)[number];

/** Response-time presets from the UI: 1:30 Quick, 4:00 Case. */
export const RESPONSE_SECONDS = [90, 240] as const;

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  googleId: string;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  /** Google profile photo; shown until/unless the user picks a preset avatar. */
  @Column({ type: 'varchar', nullable: true })
  pictureUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  stage: Stage | null;

  @Column({ type: 'varchar', nullable: true })
  course: string | null;

  @Column({ type: 'varchar', nullable: true })
  year: string | null;

  @Column({ type: 'varchar', nullable: true })
  semester: string | null;

  /** 1-8, one of the preset avatars offered in onboarding. */
  @Column({ type: 'int', nullable: true })
  avatarId: number | null;

  @Column({ type: 'varchar', nullable: true })
  goal: Goal | null;

  @Column({ type: 'int', default: 90 })
  defaultResponseSeconds: number;

  @Column({ type: 'boolean', default: true })
  soundCues: boolean;

  @Column({ type: 'boolean', default: false })
  onboarded: boolean;

  /** Set by an admin; a suspended user can't sign in or call the API. */
  @Column({ type: Date, nullable: true })
  suspendedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

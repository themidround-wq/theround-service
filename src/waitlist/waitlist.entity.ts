import {
  CreateDateColumn,
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

const isPostgres = process.env.DB_TYPE === 'postgres';

/** Landing-page signups. Ticket number shown to the user is 1000 + id. */
@Entity('waitlist')
@Unique('UQ_waitlist_email', ['email'])
export class WaitlistEntry {
  /** bigint comes back from pg as a string. */
  @PrimaryGeneratedColumn('increment', {
    type: isPostgres ? 'bigint' : 'integer',
    primaryKeyConstraintName: 'PK_waitlist_id',
  })
  id: string;

  @Column({ type: 'varchar' })
  email: string;

  @CreateDateColumn({
    name: 'created_at',
    type: isPostgres ? 'timestamptz' : 'datetime',
  })
  createdAt: Date;
}

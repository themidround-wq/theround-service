import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

export interface QuestionRubric {
  /** 3-6 things an examiner listens for, in the order they'd expect them. */
  examinerPoints: string[];
  /** Facts a correct answer must get right (doses, thresholds, sequences). */
  keyFacts: string[];
  /** Optional exemplar answer for the marker's reference. */
  modelAnswer: string | null;
}

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) name: string;
  /** Stable key the practice app uses for topic chips ("labour", "fon"…). */
  @Column({ type: 'varchar', nullable: true, unique: true }) slug:
    string | null;
  @Column({ type: 'int' }) sortOrder: number;
  /** Hidden categories are kept (old rounds point at them) but never spun. */
  @Column({ type: 'boolean', default: true }) active: boolean;
  @OneToMany(() => Topic, (t) => t.category) topics: Topic[];
}

@Entity('topics')
export class Topic {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() name: string;
  @ManyToOne(() => Category, (c) => c.topics, { onDelete: 'CASCADE' })
  category: Category;
  @OneToMany(() => Question, (q) => q.topic) questions: Question[];
}

@Entity('questions')
export class Question {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() text: string;
  /** What markers listen for; AI marking scores against this. Null = no rubric yet. */
  @Column({ type: 'simple-json', nullable: true })
  rubric: QuestionRubric | null;
  @ManyToOne(() => Topic, (t) => t.questions, { onDelete: 'CASCADE' })
  topic: Topic;
}

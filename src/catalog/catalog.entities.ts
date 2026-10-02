import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) name: string;
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
  @ManyToOne(() => Topic, (t) => t.questions, { onDelete: 'CASCADE' })
  topic: Topic;
}

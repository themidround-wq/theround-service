import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { SLUG_BY_NAME } from '../practice/topics';
import { Category, Question, Topic } from './catalog.entities';
import { PRACTICE_SEED, SEED } from './seed';

@Injectable()
export class CatalogService implements OnModuleInit {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(Topic) private readonly topics: Repository<Topic>,
    @InjectRepository(Question)
    private readonly questions: Repository<Question>,
  ) {}

  async onModuleInit() {
    if ((await this.categories.count()) === 0) {
      await this.seed({ ...SEED, ...PRACTICE_SEED }, 0);
    } else if (process.env.DB_TYPE !== 'postgres') {
      // Local SQLite: top up practice topics (Postgres gets them by migration).
      const names = new Set((await this.categories.find()).map((c) => c.name));
      const missing = Object.fromEntries(
        Object.entries(PRACTICE_SEED).filter(([n]) => !names.has(n)),
      );
      if (Object.keys(missing).length)
        await this.seed(missing, await this.categories.count());
    }
    await this.backfillSlugs();
  }

  private async seed(
    data: Record<string, Record<string, string[]>>,
    from: number,
  ) {
    let order = from;
    for (const [catName, topics] of Object.entries(data)) {
      const category = await this.categories.save({
        name: catName,
        slug: SLUG_BY_NAME[catName] ?? null,
        sortOrder: order++,
      });
      for (const [topicName, qs] of Object.entries(topics)) {
        const topic = await this.topics.save({ name: topicName, category });
        await this.questions.save(qs.map((text) => ({ text, topic })));
      }
    }
  }

  /** Give known categories their practice slug (idempotent; renamed ones keep theirs). */
  private async backfillSlugs() {
    const unslugged = await this.categories.find({ where: { slug: IsNull() } });
    const taken = new Set(
      (await this.categories.find({ where: { slug: Not(IsNull()) } })).map(
        (c) => c.slug,
      ),
    );
    for (const c of unslugged) {
      const slug = SLUG_BY_NAME[c.name];
      if (slug && !taken.has(slug)) {
        await this.categories.update(c.id, { slug });
        taken.add(slug);
      }
    }
  }

  /**
   * Categories that can be spun: active, with at least one topic that has a
   * question. Admins can hide categories or leave them half-built, so the
   * wheel never offers something it can't serve. The catalog is small, so
   * filtering in memory is fine.
   */
  private async playable() {
    const categories = await this.categories.find({
      order: { sortOrder: 'ASC' },
      relations: { topics: { questions: true } },
    });
    return categories
      .filter((c) => c.active)
      .map((c) => ({
        ...c,
        topics: c.topics.filter((t) => t.questions.length > 0),
      }))
      .filter((c) => c.topics.length > 0);
  }

  async overview() {
    const categories = await this.playable();
    return {
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      topicCount: categories.reduce((n, c) => n + c.topics.length, 0),
    };
  }

  listCategories() {
    return this.playable();
  }

  async randomTopicWithQuestion(categoryId: string) {
    const topics = (
      await this.topics.find({
        where: { category: { id: categoryId } },
        relations: { category: true, questions: true },
      })
    ).filter((t) => t.questions.length > 0);
    const topic = topics[Math.floor(Math.random() * topics.length)];
    const qs = await this.questions.find({
      where: { topic: { id: topic.id } },
    });
    const question = qs[Math.floor(Math.random() * qs.length)];
    return { category: topic.category, topic, question };
  }
}

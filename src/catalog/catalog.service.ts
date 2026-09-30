import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category, Question, Topic } from './catalog.entities';
import { SEED } from './seed';

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
    if ((await this.categories.count()) > 0) return;
    let order = 0;
    for (const [catName, topics] of Object.entries(SEED)) {
      const category = await this.categories.save({
        name: catName,
        sortOrder: order++,
      });
      for (const [topicName, qs] of Object.entries(topics)) {
        const topic = await this.topics.save({ name: topicName, category });
        await this.questions.save(qs.map((text) => ({ text, topic })));
      }
    }
  }

  async overview() {
    const categories = await this.categories.find({
      order: { sortOrder: 'ASC' },
    });
    return {
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      topicCount: await this.topics.count(),
    };
  }

  listCategories() {
    return this.categories.find({ order: { sortOrder: 'ASC' } });
  }

  async randomTopicWithQuestion(categoryId: string) {
    const topics = await this.topics.find({
      where: { category: { id: categoryId } },
      relations: { category: true },
    });
    const topic = topics[Math.floor(Math.random() * topics.length)];
    const qs = await this.questions.find({
      where: { topic: { id: topic.id } },
    });
    const question = qs[Math.floor(Math.random() * qs.length)];
    return { category: topic.category, topic, question };
  }
}

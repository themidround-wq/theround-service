import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { CatalogService } from '../catalog/catalog.service';
import { StorageService } from '../storage/storage.service';
import { UsersService } from '../users/users.service';
import {
  CompleteRoundDto,
  ListRoundsDto,
  SaveRoundDto,
  StartRoundDto,
  UpdateRoundDto,
} from './dto';
import { Round } from './round.entity';

const EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-m4a': 'm4a',
};

@Injectable()
export class RoundsService {
  constructor(
    @InjectRepository(Round) private readonly rounds: Repository<Round>,
    private readonly catalog: CatalogService,
    private readonly users: UsersService,
    private readonly storage: StorageService,
    private readonly jwt: JwtService,
  ) {}

  // ---- serialisation -------------------------------------------------------

  toDto(r: Round) {
    return {
      id: r.id,
      status: r.status,
      category: { id: r.category.id, name: r.category.name },
      topic: { id: r.topic.id, name: r.topic.name },
      question: { id: r.question.id, text: r.question.text },
      durationSeconds: r.durationSeconds,
      responseType: r.durationSeconds >= 240 ? 'case' : 'quick',
      spokenSeconds: r.spokenSeconds,
      hasAudio: !!r.audioKey,
      reflection: r.reflection,
      note: r.note,
      bookmarked: r.bookmarked,
      createdAt: r.createdAt,
      savedAt: r.savedAt,
    };
  }

  // ---- lookup --------------------------------------------------------------

  private async owned(userId: string, id: string) {
    const round = await this.rounds.findOne({
      where: { id, user: { id: userId } },
    });
    if (!round) throw new NotFoundException('Round not found');
    return round;
  }

  // ---- practice flow -------------------------------------------------------

  /** Pick a category (weighted towards the least-practised), a topic, and a question. */
  async spin(userId: string) {
    const user = await this.users.findById(userId);
    // A new spin replaces any untouched pending spin.
    await this.rounds.delete({ user: { id: userId }, status: 'spun' });

    const categories = await this.catalog.listCategories();
    const counts = await this.rounds
      .createQueryBuilder('r')
      .select('r.categoryId', 'categoryId')
      .addSelect('COUNT(*)', 'n')
      .where('r.userId = :userId AND r.status = :status', {
        userId,
        status: 'saved',
      })
      .groupBy('r.categoryId')
      .getRawMany<{ categoryId: string; n: string }>();
    const practised = new Map(counts.map((c) => [c.categoryId, Number(c.n)]));

    const weights = categories.map((c) => 1 / (1 + (practised.get(c.id) ?? 0)));
    let pick = Math.random() * weights.reduce((a, b) => a + b, 0);
    const chosen =
      categories.find((_, i) => (pick -= weights[i]) <= 0) ?? categories[0];

    const { category, topic, question } =
      await this.catalog.randomTopicWithQuestion(chosen.id);
    const round = await this.rounds.save(
      this.rounds.create({
        user: { id: userId },
        category,
        topic,
        question,
        durationSeconds: user.defaultResponseSeconds,
      }),
    );
    return this.toDto(round);
  }

  async start(userId: string, id: string, dto: StartRoundDto) {
    const round = await this.owned(userId, id);
    if (round.status !== 'spun')
      throw new ConflictException('Round already started');
    if (dto.durationSeconds) round.durationSeconds = dto.durationSeconds;
    round.status = 'in_progress';
    round.startedAt = new Date();
    return this.toDto(await this.rounds.save(round));
  }

  async complete(
    userId: string,
    id: string,
    dto: CompleteRoundDto,
    file?: Express.Multer.File,
  ) {
    const round = await this.owned(userId, id);
    if (round.status !== 'in_progress')
      throw new ConflictException('Round is not in progress');
    if (!file) throw new BadRequestException('Audio file is required');
    const mime = file.mimetype.split(';')[0];
    const ext = EXT[mime];
    if (!ext)
      throw new BadRequestException(`Unsupported audio type ${file.mimetype}`);
    if (dto.spokenSeconds > round.durationSeconds + 5) {
      throw new BadRequestException(
        'spokenSeconds exceeds the allowed response time',
      );
    }

    round.audioKey = await this.storage.save(
      `${userId}/${round.id}.${ext}`,
      file.buffer,
      mime,
    );
    round.audioMime = mime;
    round.spokenSeconds = dto.spokenSeconds;
    round.status = 'completed';
    round.completedAt = new Date();
    return this.toDto(await this.rounds.save(round));
  }

  async save(userId: string, id: string, dto: SaveRoundDto) {
    const round = await this.owned(userId, id);
    if (round.status === 'saved')
      throw new ConflictException('Round already saved');
    if (round.status !== 'completed')
      throw new ConflictException('Finish the round before saving');
    round.reflection = dto.reflection ?? null;
    round.note = dto.note?.trim() || null;
    round.status = 'saved';
    round.savedAt = new Date();
    return this.toDto(await this.rounds.save(round));
  }

  /** Discard a round ("Try another round" / close). Also deletes its audio. */
  async remove(userId: string, id: string) {
    const round = await this.owned(userId, id);
    if (round.audioKey) await this.storage.remove(round.audioKey);
    await this.rounds.remove(round);
  }

  /** "Practice this again": new round with the same question. */
  async repeat(userId: string, id: string) {
    const source = await this.owned(userId, id);
    const user = await this.users.findById(userId);
    await this.rounds.delete({ user: { id: userId }, status: 'spun' });
    const round = await this.rounds.save(
      this.rounds.create({
        user: { id: userId },
        category: source.category,
        topic: source.topic,
        question: source.question,
        durationSeconds: user.defaultResponseSeconds,
      }),
    );
    return this.toDto(round);
  }

  // ---- history -------------------------------------------------------------

  async list(userId: string, q: ListRoundsDto) {
    const qb = this.rounds
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.category', 'category')
      .innerJoinAndSelect('r.topic', 'topic')
      .innerJoinAndSelect('r.question', 'question')
      .where('r.userId = :userId AND r.status = :status', {
        userId,
        status: 'saved',
      });
    if (q.categoryId) qb.andWhere('category.id = :cid', { cid: q.categoryId });
    if (q.search) {
      qb.andWhere(
        '(LOWER(question.text) LIKE :s OR LOWER(topic.name) LIKE :s)',
        {
          s: `%${q.search.toLowerCase()}%`,
        },
      );
    }
    const [items, total] = await qb
      .orderBy('r.savedAt', 'DESC')
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getManyAndCount();
    return {
      items: items.map((r) => this.toDto(r)),
      total,
      page: q.page,
      limit: q.limit,
      hasMore: q.page * q.limit < total,
    };
  }

  async get(userId: string, id: string) {
    return this.toDto(await this.owned(userId, id));
  }

  async update(userId: string, id: string, dto: UpdateRoundDto) {
    const round = await this.owned(userId, id);
    if (round.status !== 'saved')
      throw new ConflictException('Only saved rounds can be edited');
    if (dto.reflection !== undefined) round.reflection = dto.reflection;
    if (dto.note !== undefined) round.note = dto.note.trim() || null;
    if (dto.bookmarked !== undefined) round.bookmarked = dto.bookmarked;
    return this.toDto(await this.rounds.save(round));
  }

  /**
   * Playable URL valid for ~15 minutes. Remote: a signed R2/S3 link. Local dev:
   * a token-protected URL on this server, so `<audio src>` works either way.
   */
  async audioUrl(userId: string, id: string, origin: string) {
    const round = await this.owned(userId, id);
    if (!round.audioKey) throw new NotFoundException('No audio for this round');
    const expiresInSeconds = 15 * 60;
    if (this.storage.isRemote) {
      return {
        url: await this.storage.signedUrl(round.audioKey, round.audioMime!),
        expiresInSeconds,
      };
    }
    const token = await this.jwt.signAsync(
      { sub: userId, rid: id, aud: 'audio' },
      { expiresIn: expiresInSeconds },
    );
    return {
      url: `${origin}/api/rounds/${id}/audio/file?token=${token}`,
      expiresInSeconds,
    };
  }

  /** Local-storage only: resolve a file for a token minted by audioUrl(). */
  async localAudio(id: string, token: string) {
    const claims = await this.jwt
      .verifyAsync<{ sub: string; rid: string; aud: string }>(token)
      .catch(() => null);
    if (!claims || claims.aud !== 'audio' || claims.rid !== id)
      throw new NotFoundException();
    const round = await this.owned(claims.sub, id);
    if (!round.audioKey || this.storage.isRemote) throw new NotFoundException();
    return {
      path: this.storage.localPath(round.audioKey),
      mime: round.audioMime!,
    };
  }

  // ---- stats ---------------------------------------------------------------

  async stats(userId: string) {
    const saved = await this.rounds.find({
      where: { user: { id: userId }, status: 'saved' },
      select: { id: true, spokenSeconds: true, savedAt: true },
      relations: { category: true },
    });

    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const byCategory = new Map<string, { name: string; n: number }>();
    let speaking = 0;
    let thisWeek = 0;
    for (const r of saved) {
      speaking += r.spokenSeconds ?? 0;
      if (r.savedAt && r.savedAt.getTime() >= weekAgo) thisWeek++;
      const e = byCategory.get(r.category.id) ?? {
        name: r.category.name,
        n: 0,
      };
      e.n++;
      byCategory.set(r.category.id, e);
    }
    const top = [...byCategory.values()].sort((a, b) => b.n - a.n)[0];

    return {
      totalRounds: saved.length,
      roundsThisWeek: thisWeek,
      speakingSeconds: speaking,
      mostPractised: top ? { category: top.name, rounds: top.n } : null,
      currentStreakDays: this.streak(saved.map((r) => r.savedAt!)),
    };
  }

  /** Consecutive days (UTC) with a saved round, ending today or yesterday. */
  private streak(dates: Date[]) {
    const day = (d: Date) => Math.floor(d.getTime() / 86_400_000);
    const days = new Set(dates.map(day));
    let cursor = day(new Date());
    if (!days.has(cursor)) cursor--;
    let n = 0;
    while (days.has(cursor)) {
      n++;
      cursor--;
    }
    return n;
  }
}

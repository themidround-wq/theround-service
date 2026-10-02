import {
  BadRequestException,
  Global,
  Injectable,
  Module,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AppSetting,
  isSettingKey,
  SETTINGS,
  SettingKey,
  SettingsMap,
  SettingValue,
} from './settings';

/** Short enough that every instance picks up a change within a minute. */
const CACHE_MS = 30_000;

@Injectable()
export class SettingsService {
  private cache: { values: SettingsMap; at: number } | null = null;

  constructor(
    @InjectRepository(AppSetting)
    private readonly repo: Repository<AppSetting>,
  ) {}

  async all(): Promise<SettingsMap> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) {
      return this.cache.values;
    }
    const rows = await this.repo.find();
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    const values = {} as Record<string, unknown>;
    for (const key of Object.keys(SETTINGS) as SettingKey[]) {
      const raw = stored.get(key);
      values[key] = raw === undefined ? SETTINGS[key].default : JSON.parse(raw);
    }
    this.cache = { values: values as SettingsMap, at: Date.now() };
    return this.cache.values;
  }

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    return (await this.all())[key];
  }

  /** Settings with their metadata, for the admin settings screen. */
  async describe() {
    const values = await this.all();
    const rows = await this.repo.find();
    const meta = new Map(rows.map((r) => [r.key, r]));
    return (Object.keys(SETTINGS) as SettingKey[]).map((key) => ({
      key,
      ...SETTINGS[key],
      value: values[key],
      updatedAt: meta.get(key)?.updatedAt ?? null,
      updatedBy: meta.get(key)?.updatedBy ?? null,
    }));
  }

  /** Validates every key before writing any of them. */
  async update(patch: Record<string, unknown>, by: string) {
    const entries = Object.entries(patch);
    for (const [key, value] of entries) {
      if (!isSettingKey(key)) {
        throw new BadRequestException(`Unknown setting "${key}"`);
      }
      const def = SETTINGS[key];
      if (typeof value !== def.type) {
        throw new BadRequestException(`${key} must be a ${def.type}`);
      }
      if (
        'options' in def &&
        !(def.options as readonly unknown[]).includes(value)
      ) {
        throw new BadRequestException(
          `${key} must be one of ${def.options.join(', ')}`,
        );
      }
    }
    await this.repo.save(
      entries.map(([key, value]) => ({
        key,
        value: JSON.stringify(value),
        updatedBy: by,
      })),
    );
    this.cache = null;
    return this.describe();
  }
}

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AppSetting])],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}

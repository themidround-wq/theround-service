import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateProfileDto } from './dto';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  async findById(id: string) {
    const user = await this.repo.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Creates the account on first sign-in, prefilled from Google. Later
   * sign-ins never overwrite a name the user may have edited; only the photo
   * is refreshed.
   */
  async upsertFromGoogle(
    profile: {
      googleId: string;
      email: string;
      name?: string;
      pictureUrl?: string;
    },
    opts: { allowCreate?: boolean; defaultResponseSeconds?: number } = {},
  ) {
    const existing =
      (await this.repo.findOneBy({ googleId: profile.googleId })) ??
      (await this.repo.findOneBy({ email: profile.email }));
    if (existing) {
      if (profile.pictureUrl && profile.pictureUrl !== existing.pictureUrl) {
        existing.pictureUrl = profile.pictureUrl;
        await this.repo.save(existing);
      }
      return { user: existing, isNewUser: false };
    }
    // Sign-ups paused by an admin: existing accounts above still get in.
    if (opts.allowCreate === false) {
      throw new ForbiddenException('New sign-ups are paused');
    }
    const user = await this.repo.save(
      this.repo.create({
        googleId: profile.googleId,
        email: profile.email,
        name: profile.name ?? null,
        pictureUrl: profile.pictureUrl ?? null,
        ...(opts.defaultResponseSeconds
          ? { defaultResponseSeconds: opts.defaultResponseSeconds }
          : {}),
      }),
    );
    return { user, isNewUser: true };
  }

  /** Public shape of a user — never leaks googleId or internal columns. */
  toDto(u: User) {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      pictureUrl: u.pictureUrl,
      avatarId: u.avatarId,
      stage: u.stage,
      course: u.course,
      year: u.year,
      semester: u.semester,
      goal: u.goal,
      defaultResponseSeconds: u.defaultResponseSeconds,
      soundCues: u.soundCues,
      onboarded: u.onboarded,
    };
  }

  async update(id: string, dto: UpdateProfileDto) {
    const user = await this.findById(id);
    Object.assign(user, dto);
    // Onboarding is complete once the basics and step 2 choices exist.
    user.onboarded = !!(user.name && user.stage && user.avatarId && user.goal);
    return this.repo.save(user);
  }
}

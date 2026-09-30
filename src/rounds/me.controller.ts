import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard, UserId } from '../auth/auth.guard';
import { UpdateProfileDto } from '../users/dto';
import { UsersService } from '../users/users.service';
import { RoundsService } from './rounds.service';

@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly rounds: RoundsService,
  ) {}

  /** Profile + stats (profile page, header chip, onboarding gate via `onboarded`). */
  @Get()
  async me(@UserId() userId: string) {
    const [user, stats] = await Promise.all([
      this.users.findById(userId),
      this.rounds.stats(userId),
    ]);
    return { user: this.users.toDto(user), stats };
  }

  /** Onboarding steps 1-2, "Edit details", and practice preferences. */
  @Patch()
  async update(@UserId() userId: string, @Body() dto: UpdateProfileDto) {
    return this.users.toDto(await this.users.update(userId, dto));
  }
}

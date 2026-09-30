import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { MeResponse, UserResponse } from '../common/api.response';
import { AuthGuard, UserId } from '../auth/auth.guard';
import { UpdateProfileDto } from '../users/dto';
import { UsersService } from '../users/users.service';
import { RoundsService } from './rounds.service';

@ApiTags('Profile')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Missing or invalid bearer token',
  schema: { example: { statusCode: 401, message: 'Unauthorized' } },
})
@ApiBadRequestResponse({
  description: 'Validation failed',
  schema: {
    example: {
      statusCode: 400,
      error: 'Bad Request',
      message: ['avatarId must not be greater than 8'],
    },
  },
})
@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly rounds: RoundsService,
  ) {}

  @ApiOperation({
    summary: 'Current user with stats',
    description:
      'Powers the header chip and profile page. Use `user.onboarded` to gate onboarding.',
  })
  @ApiOkResponse({ type: MeResponse })
  @Get()
  async me(@UserId() userId: string) {
    const [user, stats] = await Promise.all([
      this.users.findById(userId),
      this.rounds.stats(userId),
    ]);
    return { user: this.users.toDto(user), stats };
  }

  @ApiOperation({
    summary: 'Update profile',
    description:
      'Used for onboarding steps 1–2, "Edit details", and practice preferences. Send only the fields that changed.',
  })
  @ApiBody({
    type: UpdateProfileDto,
    examples: {
      onboardingStep1: {
        summary: 'Onboarding step 1 — the basics',
        value: {
          name: 'Nkem',
          stage: 'student',
          course: 'Midwifery',
          year: 'Year 2',
          semester: 'Semester 1',
        },
      },
      onboardingStep2: {
        summary: 'Onboarding step 2 — avatar and goal',
        value: { avatarId: 4, goal: 'build_confidence' },
      },
      preferences: {
        summary: 'Practice preferences',
        value: { defaultResponseSeconds: 240, soundCues: false },
      },
    },
  })
  @ApiOkResponse({ type: UserResponse })
  @Patch()
  async update(@UserId() userId: string, @Body() dto: UpdateProfileDto) {
    return this.users.toDto(await this.users.update(userId, dto));
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiExcludeController,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AudioUrlResponse,
  RoundListResponse,
  RoundResponse,
  StatsResponse,
} from '../common/api.response';
import type { Request, Response } from 'express';
import { AuthGuard, UserId } from '../auth/auth.guard';
import {
  CompleteRoundDto,
  ListRoundsDto,
  SaveRoundDto,
  StartRoundDto,
  UpdateRoundDto,
} from './dto';
import { RoundsService } from './rounds.service';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

@ApiTags('Rounds')
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
@ApiNotFoundResponse({
  description: 'Round not found (or not yours)',
  schema: {
    example: {
      statusCode: 404,
      message: 'Round not found',
      error: 'Not Found',
    },
  },
})
@Controller('rounds')
@UseGuards(AuthGuard)
export class RoundsController {
  constructor(private readonly rounds: RoundsService) {}

  @ApiOperation({
    summary: 'Spin the wheel',
    description:
      'Picks a category (weighted towards the least practised), a topic and a question, and creates a pending round. Replaces any earlier unstarted spin.',
  })
  @ApiCreatedResponse({ type: RoundResponse })
  @Post('spin')
  spin(@UserId() userId: string) {
    return this.rounds.spin(userId);
  }

  @ApiOperation({
    summary: 'History stats',
    description:
      'Total rounds, this week, time speaking, most practised category.',
  })
  @ApiOkResponse({ type: StatsResponse })
  @Get('stats')
  stats(@UserId() userId: string) {
    return this.rounds.stats(userId);
  }

  @ApiOperation({
    summary: 'Round history',
    description:
      'Saved rounds, newest first. Supports text search, category filter and paging ("Load more").',
  })
  @ApiOkResponse({ type: RoundListResponse })
  @Get()
  list(@UserId() userId: string, @Query() query: ListRoundsDto) {
    return this.rounds.list(userId, query);
  }

  @ApiOperation({ summary: 'Get a round' })
  @ApiOkResponse({ type: RoundResponse })
  @Get(':id')
  get(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.rounds.get(userId, id);
  }

  @ApiOperation({
    summary: 'Start the round',
    description:
      'Moves spun → in_progress. Optionally sets the response time (90 Quick / 240 Case).',
  })
  @ApiOkResponse({ type: RoundResponse })
  @ApiConflictResponse({ description: 'Round already started' })
  @Post(':id/start')
  @HttpCode(200)
  start(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartRoundDto,
  ) {
    return this.rounds.start(userId, id, dto);
  }

  @ApiOperation({
    summary: 'Finish the round with the recording',
    description:
      'Moves in_progress → completed. Audio types: webm, ogg, mp4/m4a, mp3, wav; max 25 MB.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['audio', 'spokenSeconds'],
      properties: {
        audio: { type: 'string', format: 'binary' },
        spokenSeconds: {
          type: 'integer',
          minimum: 1,
          maximum: 600,
          example: 84,
        },
      },
    },
  })
  @ApiOkResponse({ type: RoundResponse })
  @ApiConflictResponse({ description: 'Round is not in progress' })
  @Post(':id/complete')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('audio', { limits: { fileSize: MAX_AUDIO_BYTES } }),
  )
  complete(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteRoundDto,
    @UploadedFile(new ParseFilePipeBuilder().build({ fileIsRequired: true }))
    file: Express.Multer.File,
  ) {
    return this.rounds.complete(userId, id, dto, file);
  }

  @ApiOperation({
    summary: 'Save this attempt',
    description:
      'Moves completed → saved, with the optional reflection and note. Only saved rounds appear in history.',
  })
  @ApiOkResponse({ type: RoundResponse })
  @ApiConflictResponse({ description: 'Not completed yet, or already saved' })
  @Post(':id/save')
  @HttpCode(200)
  save(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveRoundDto,
  ) {
    return this.rounds.save(userId, id, dto);
  }

  @ApiOperation({
    summary: 'Practice this again',
    description: 'Creates a new pending round with the same question.',
  })
  @ApiCreatedResponse({ type: RoundResponse })
  @Post(':id/repeat')
  repeat(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.rounds.repeat(userId, id);
  }

  @ApiOperation({
    summary: 'Edit a saved round',
    description: 'Bookmark, reflection or note.',
  })
  @ApiOkResponse({ type: RoundResponse })
  @Patch(':id')
  update(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoundDto,
  ) {
    return this.rounds.update(userId, id, dto);
  }

  @ApiOperation({
    summary: 'Discard a round',
    description:
      'Deletes the round and its audio. Used for "Try another round" and closing mid-flow.',
  })
  @ApiNoContentResponse()
  @Delete(':id')
  @HttpCode(204)
  remove(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.rounds.remove(userId, id);
  }

  @ApiOperation({
    summary: 'Playable audio URL',
    description:
      'Short-lived signed URL (~15 min) — set it as the `<audio>` src.',
  })
  @ApiOkResponse({ type: AudioUrlResponse })
  @Get(':id/audio')
  audio(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.rounds.audioUrl(
      userId,
      id,
      `${req.protocol}://${req.get('host')}`,
    );
  }
}

/** Local-dev audio file server; authorised by the signed token, not the header. */
@ApiExcludeController()
@Controller('rounds')
export class LocalAudioController {
  constructor(private readonly rounds: RoundsService) {}

  @Get(':id/audio/file')
  async file(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    const { path, mime } = await this.rounds.localAudio(id, token ?? '');
    res.type(mime).sendFile(path);
  }
}

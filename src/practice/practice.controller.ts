import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthGuard, UserId } from '../auth/auth.guard';
import {
  CompletePracticeRoundDto,
  PickTopicDto,
  RenameSessionDto,
  SetDurationDto,
  StartSessionDto,
} from './dto';
import { PracticeService } from './practice.service';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const id = new ParseUUIDPipe();

/**
 * Chat-style practice for the app: sessions (threads) of rounds with scored
 * feedback. Responses match theround-client lib/practice/types.ts.
 */
@ApiTags('Practice')
@ApiBearerAuth()
@Controller('practice')
@UseGuards(AuthGuard)
export class PracticeController {
  constructor(private readonly practice: PracticeService) {}

  @ApiOperation({ summary: 'Topic chips for this user (by course)' })
  @Get('topics')
  topics(@UserId() userId: string) {
    return this.practice.topics(userId);
  }

  @ApiOperation({ summary: 'Practice stats for the profile page' })
  @Get('stats')
  stats(@UserId() userId: string) {
    return this.practice.stats(userId);
  }

  @ApiOperation({ summary: 'Sidebar history (newest first)' })
  @Get('sessions')
  list(@UserId() userId: string) {
    return this.practice.list(userId);
  }

  @ApiOperation({ summary: 'Start a session with a topic slug or "surprise"' })
  @Post('sessions')
  start(@UserId() userId: string, @Body() dto: StartSessionDto) {
    return this.practice.start(userId, dto.categoryId);
  }

  @Get('sessions/:id')
  get(@UserId() userId: string, @Param('id', id) sid: string) {
    return this.practice.get(userId, sid);
  }

  @ApiOperation({ summary: 'Rename' })
  @Patch('sessions/:id')
  rename(
    @UserId() userId: string,
    @Param('id', id) sid: string,
    @Body() dto: RenameSessionDto,
  ) {
    return this.practice.rename(userId, sid, dto.title);
  }

  @ApiOperation({ summary: 'Delete (soft; restorable with /restore)' })
  @Delete('sessions/:id')
  remove(@UserId() userId: string, @Param('id', id) sid: string) {
    return this.practice.remove(userId, sid);
  }

  @Post('sessions/:id/restore')
  @HttpCode(204)
  restore(@UserId() userId: string, @Param('id', id) sid: string) {
    return this.practice.restore(userId, sid);
  }

  @ApiOperation({ summary: '"Try again": same question as the last round' })
  @Post('sessions/:id/retake')
  @HttpCode(200)
  retake(@UserId() userId: string, @Param('id', id) sid: string) {
    return this.practice.retake(userId, sid);
  }

  @ApiOperation({ summary: '"Next question": another question, same topic' })
  @Post('sessions/:id/next')
  @HttpCode(200)
  next(@UserId() userId: string, @Param('id', id) sid: string) {
    return this.practice.next(userId, sid);
  }

  @ApiOperation({ summary: '"Change topic": show the topic picker' })
  @Post('sessions/:id/change-topic')
  @HttpCode(200)
  changeTopic(@UserId() userId: string, @Param('id', id) sid: string) {
    return this.practice.changeTopic(userId, sid);
  }

  @ApiOperation({ summary: 'Continue the session with a new topic' })
  @Post('sessions/:id/topic')
  @HttpCode(200)
  pickTopic(
    @UserId() userId: string,
    @Param('id', id) sid: string,
    @Body() dto: PickTopicDto,
  ) {
    return this.practice.pickTopic(userId, sid, dto.categoryId);
  }

  @ApiOperation({ summary: 'Answer length before recording (90 or 240)' })
  @Patch('rounds/:id')
  setDuration(
    @UserId() userId: string,
    @Param('id', id) rid: string,
    @Body() dto: SetDurationDto,
  ) {
    return this.practice.setDuration(userId, rid, dto.durationSeconds);
  }

  @ApiOperation({ summary: '"Different question" before recording' })
  @Post('rounds/:id/different')
  @HttpCode(200)
  different(@UserId() userId: string, @Param('id', id) rid: string) {
    return this.practice.different(userId, rid);
  }

  @ApiOperation({
    summary: 'Recording finished (multipart: audio?, spokenSeconds)',
  })
  @ApiConsumes('multipart/form-data')
  @Post('rounds/:id/complete')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('audio', { limits: { fileSize: MAX_AUDIO_BYTES } }),
  )
  complete(
    @UserId() userId: string,
    @Param('id', id) rid: string,
    @Body() dto: CompletePracticeRoundDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.practice.complete(userId, rid, dto.spokenSeconds, file);
  }

  @ApiOperation({
    summary: 'Score the answer (placeholder assessor) and save the round',
  })
  @Post('rounds/:id/review')
  @HttpCode(200)
  review(@UserId() userId: string, @Param('id', id) rid: string) {
    return this.practice.review(userId, rid);
  }

  @ApiOperation({ summary: 'Signed playback URL for the recording' })
  @Get('rounds/:id/audio')
  audio(
    @UserId() userId: string,
    @Param('id', id) rid: string,
    @Req() req: Request,
  ) {
    return this.practice.audio(
      userId,
      rid,
      `${req.protocol}://${req.get('host')}`,
    );
  }
}

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

@Controller('rounds')
@UseGuards(AuthGuard)
export class RoundsController {
  constructor(private readonly rounds: RoundsService) {}

  @Post('spin')
  spin(@UserId() userId: string) {
    return this.rounds.spin(userId);
  }

  @Get('stats')
  stats(@UserId() userId: string) {
    return this.rounds.stats(userId);
  }

  @Get()
  list(@UserId() userId: string, @Query() query: ListRoundsDto) {
    return this.rounds.list(userId, query);
  }

  @Get(':id')
  get(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.rounds.get(userId, id);
  }

  @Post(':id/start')
  @HttpCode(200)
  start(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartRoundDto,
  ) {
    return this.rounds.start(userId, id, dto);
  }

  /** multipart/form-data: `audio` (file) + `spokenSeconds`. */
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

  @Post(':id/save')
  @HttpCode(200)
  save(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveRoundDto,
  ) {
    return this.rounds.save(userId, id, dto);
  }

  @Post(':id/repeat')
  repeat(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.rounds.repeat(userId, id);
  }

  @Patch(':id')
  update(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoundDto,
  ) {
    return this.rounds.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.rounds.remove(userId, id);
  }

  /** Returns `{ url, expiresInSeconds }` — set it as the `<audio>` src. */
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

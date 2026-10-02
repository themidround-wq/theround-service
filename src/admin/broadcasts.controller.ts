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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AudienceQueryDto,
  BroadcastContentDto,
  ListBroadcastsDto,
  ListRecipientsDto,
  ScheduleDto,
  TestSendDto,
  UnsubscribeDto,
} from '../broadcasts/dto';
import { BroadcastsService } from '../broadcasts/broadcasts.service';
import type { AdminUser } from './admin.entities';
import { AdminGuard, CurrentAdmin, RequireRole } from './admin.guard';
import { AuditService } from './audit.service';
import { PageQueryDto } from './dto';

@ApiTags('Admin · Newsletters')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminBroadcastsController {
  constructor(
    private readonly broadcasts: BroadcastsService,
    private readonly audit: AuditService,
  ) {}

  @Get('broadcasts')
  list(@Query() q: ListBroadcastsDto) {
    return this.broadcasts.list(q);
  }

  @Get('broadcasts/summary')
  summary() {
    return this.broadcasts.summary();
  }

  @ApiOperation({
    summary: 'Audiences with live recipient counts',
    description:
      'Counts leave out unsubscribed addresses, except for maintenance notices.',
  })
  @Get('broadcasts/audiences')
  audiences(@Query() q: AudienceQueryDto) {
    return this.broadcasts.audiences(q.kind);
  }

  @ApiOperation({ summary: 'Render an email from unsaved editor content' })
  @Post('broadcasts/preview')
  @HttpCode(200)
  preview(@CurrentAdmin() admin: AdminUser, @Body() dto: BroadcastContentDto) {
    return this.broadcasts.preview(
      {
        kind: dto.kind ?? 'newsletter',
        subject: dto.subject ?? '',
        preheader: dto.preheader ?? '',
        headline: dto.headline ?? '',
        bodyHtml: dto.bodyHtml ?? '',
        ctaLabel: dto.ctaLabel ?? null,
        ctaUrl: dto.ctaUrl ?? null,
      },
      admin.name,
    );
  }

  @Get('broadcasts/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.broadcasts.get(id);
  }

  @Get('broadcasts/:id/recipients')
  recipients(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: ListRecipientsDto,
  ) {
    return this.broadcasts.listRecipients(id, q);
  }

  @RequireRole('admin')
  @Post('broadcasts')
  async create(
    @CurrentAdmin() by: AdminUser,
    @Body() dto: BroadcastContentDto,
  ) {
    const b = await this.broadcasts.create(by.email, dto);
    await this.audit.record(by, 'broadcast.create', b.subject || b.id, {
      kind: b.kind,
    });
    return b;
  }

  @RequireRole('admin')
  @Patch('broadcasts/:id')
  update(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BroadcastContentDto,
  ) {
    return this.broadcasts.update(id, by.email, dto);
  }

  @ApiOperation({
    summary: 'Send a [Test] copy',
    description: 'To your own email unless `to` is given (max 5).',
  })
  @RequireRole('admin')
  @Post('broadcasts/:id/test')
  @HttpCode(200)
  async test(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TestSendDto,
  ) {
    const to = dto.to ?? [by.email];
    const r = await this.broadcasts.sendTest(id, to, by.name);
    await this.audit.record(by, 'broadcast.test', id, { to });
    return r;
  }

  @RequireRole('admin')
  @Post('broadcasts/:id/schedule')
  @HttpCode(200)
  async schedule(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleDto,
  ) {
    const b = await this.broadcasts.schedule(id, by.email, dto.scheduledAt);
    await this.audit.record(by, 'broadcast.schedule', b.subject, {
      at: dto.scheduledAt,
      audience: b.audience,
    });
    return b;
  }

  @ApiOperation({
    summary: 'Start sending now',
    description:
      'Snapshots the audience, then sends in batches of 100 in the background.',
  })
  @RequireRole('admin')
  @Post('broadcasts/:id/send')
  @HttpCode(200)
  async send(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const b = await this.broadcasts.sendNow(id);
    await this.audit.record(by, 'broadcast.send', b.subject, {
      audience: b.audience,
      recipients: b.recipientCount,
    });
    return b;
  }

  @RequireRole('admin')
  @Post('broadcasts/:id/cancel')
  @HttpCode(200)
  async cancel(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const b = await this.broadcasts.cancel(id);
    await this.audit.record(by, 'broadcast.cancel', b.subject, {
      status: b.status,
      sent: b.sentCount,
    });
    return b;
  }

  @ApiOperation({ summary: 'Re-send to the recipients that failed' })
  @RequireRole('admin')
  @Post('broadcasts/:id/retry')
  @HttpCode(200)
  async retry(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const r = await this.broadcasts.retryFailed(id);
    await this.audit.record(by, 'broadcast.retry', id, r);
    return r;
  }

  @RequireRole('admin')
  @Post('broadcasts/:id/duplicate')
  async duplicate(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.broadcasts.duplicate(id, by.email);
  }

  @RequireRole('admin')
  @Delete('broadcasts/:id')
  @HttpCode(204)
  async remove(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const b = await this.broadcasts.remove(id);
    await this.audit.record(by, 'broadcast.delete', b.subject || id);
  }

  // unsubscribes

  @Get('unsubscribes')
  unsubscribes(@Query() q: PageQueryDto) {
    return this.broadcasts.listUnsubscribes(q);
  }

  @ApiOperation({
    summary:
      'Unsubscribe someone who asked by other means (e.g. replied to an email)',
  })
  @RequireRole('admin')
  @Post('unsubscribes')
  @HttpCode(200)
  async addUnsubscribe(
    @CurrentAdmin() by: AdminUser,
    @Body() dto: UnsubscribeDto,
  ) {
    const added = await this.broadcasts.unsubscribe(dto.email, 'admin');
    await this.audit.record(by, 'unsubscribe.add', dto.email);
    return { added };
  }

  @ApiOperation({ summary: 'Resubscribe — only when the person asked for it' })
  @RequireRole('admin')
  @Delete('unsubscribes/:email')
  @HttpCode(204)
  async resubscribe(
    @CurrentAdmin() by: AdminUser,
    @Param('email') email: string,
  ) {
    await this.broadcasts.resubscribe(email);
    await this.audit.record(by, 'unsubscribe.remove', email);
  }
}

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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
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
import {
  AddUnsubscribeResponse,
  AudienceResponse,
  BroadcastListResponse,
  BroadcastRecipientListResponse,
  BroadcastResponse,
  BroadcastSummaryResponse,
  RenderedEmailResponse,
  RetryResponse,
  TestSendResponse,
  UnsubscribeListResponse,
} from './admin.response';

@ApiTags('Admin · Newsletters')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminBroadcastsController {
  constructor(
    private readonly broadcasts: BroadcastsService,
    private readonly audit: AuditService,
  ) {}

  @ApiOperation({
    summary: 'List newsletters',
    description: 'Most recently edited first. Filter by status.',
  })
  @ApiOkResponse({ type: BroadcastListResponse })
  @Get('broadcasts')
  list(@Query() q: ListBroadcastsDto) {
    return this.broadcasts.list(q);
  }

  @ApiOperation({
    summary: 'Totals for the summary tiles',
    description:
      'Sends in the last 30 days, scheduled, drafts and unsubscribes.',
  })
  @ApiOkResponse({ type: BroadcastSummaryResponse })
  @Get('broadcasts/summary')
  summary() {
    return this.broadcasts.summary();
  }

  @ApiOperation({
    summary: 'Audiences with live recipient counts',
    description:
      'Counts leave out unsubscribed addresses, except for maintenance notices.',
  })
  @ApiOkResponse({ type: [AudienceResponse] })
  @Get('broadcasts/audiences')
  audiences(@Query() q: AudienceQueryDto) {
    return this.broadcasts.audiences(q.kind);
  }

  @ApiOperation({ summary: 'Render an email from unsaved editor content' })
  @ApiOkResponse({ type: RenderedEmailResponse })
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

  @ApiOperation({ summary: 'One newsletter, with its content' })
  @ApiOkResponse({ type: BroadcastResponse })
  @Get('broadcasts/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.broadcasts.get(id);
  }

  @ApiOperation({
    summary: 'Who a newsletter goes to',
    description:
      'The snapshot taken when sending started. Filter by status or search by email.',
  })
  @ApiOkResponse({ type: BroadcastRecipientListResponse })
  @Get('broadcasts/:id/recipients')
  recipients(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: ListRecipientsDto,
  ) {
    return this.broadcasts.listRecipients(id, q);
  }

  @ApiOperation({ summary: 'Create a draft' })
  @ApiCreatedResponse({ type: BroadcastResponse })
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

  @ApiOperation({ summary: 'Edit a draft or scheduled newsletter' })
  @ApiOkResponse({ type: BroadcastResponse })
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
  @ApiOkResponse({ type: TestSendResponse })
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

  @ApiOperation({
    summary: 'Schedule for later',
    description: 'At least a minute from now and within the next year.',
  })
  @ApiOkResponse({ type: BroadcastResponse })
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
  @ApiOkResponse({ type: BroadcastResponse })
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

  @ApiOperation({
    summary: 'Cancel a send',
    description:
      'A scheduled newsletter goes back to draft; one that is sending stops after the current batch.',
  })
  @ApiOkResponse({ type: BroadcastResponse })
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
  @ApiOkResponse({ type: RetryResponse })
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

  @ApiOperation({ summary: 'Copy into a new draft' })
  @ApiCreatedResponse({ type: BroadcastResponse })
  @RequireRole('admin')
  @Post('broadcasts/:id/duplicate')
  async duplicate(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.broadcasts.duplicate(id, by.email);
  }

  @ApiOperation({
    summary: 'Delete a draft or cancelled newsletter',
    description: 'Sent newsletters stay as a record.',
  })
  @ApiNoContentResponse()
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

  @ApiOperation({
    summary: 'List unsubscribed addresses',
    description: 'Newest first. Search by email.',
  })
  @ApiOkResponse({ type: UnsubscribeListResponse })
  @Get('unsubscribes')
  unsubscribes(@Query() q: PageQueryDto) {
    return this.broadcasts.listUnsubscribes(q);
  }

  @ApiOperation({
    summary:
      'Unsubscribe someone who asked by other means (e.g. replied to an email)',
  })
  @ApiOkResponse({ type: AddUnsubscribeResponse })
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
  @ApiNoContentResponse()
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

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
  ListEmailRepliesDto,
  SendEmailReplyDto,
  TestInboundReplyDto,
  UpdateEmailReplyStatusDto,
} from '../email-replies/dto';
import { EmailRepliesService } from '../email-replies/email-replies.service';
import type { AdminUser } from './admin.entities';
import { AdminGuard, CurrentAdmin, RequireRole } from './admin.guard';
import {
  EmailReplyDetailResponse,
  EmailReplyListResponse,
  EmailReplySummaryResponse,
} from './admin.response';
import { AuditService } from './audit.service';

@ApiTags('Admin · Email Replies')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/email-replies')
export class AdminEmailRepliesController {
  constructor(
    private readonly emailReplies: EmailRepliesService,
    private readonly audit: AuditService,
  ) {}

  @ApiOperation({
    summary: 'List email replies',
    description: 'Most recently received first. Filter by status, broadcast or user.',
  })
  @ApiOkResponse({ type: EmailReplyListResponse })
  @Get()
  list(@Query() q: ListEmailRepliesDto) {
    return this.emailReplies.list(q);
  }

  @ApiOperation({
    summary: 'Totals for summary tiles',
    description: 'Total, unread, read, archived, and replied counts.',
  })
  @ApiOkResponse({ type: EmailReplySummaryResponse })
  @Get('summary')
  summary() {
    return this.emailReplies.summary();
  }

  @ApiOperation({
    summary: 'Get single email reply with conversation thread',
  })
  @ApiOkResponse({ type: EmailReplyDetailResponse })
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.emailReplies.get(id);
  }

  @ApiOperation({
    summary: 'Update reply status (unread, read, archived)',
  })
  @ApiOkResponse({ type: EmailReplyDetailResponse })
  @RequireRole('admin')
  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmailReplyStatusDto,
    @CurrentAdmin() by: AdminUser,
  ) {
    const r = await this.emailReplies.updateStatus(id, dto);
    await this.audit.record(by, 'email_reply.status', r.fromEmail, {
      status: dto.status,
    });
    return r;
  }

  @ApiOperation({
    summary: 'Send an email response directly back to the sender',
  })
  @ApiCreatedResponse({ description: 'Reply sent and recorded in thread' })
  @RequireRole('admin')
  @Post(':id/reply')
  async sendReply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendEmailReplyDto,
    @CurrentAdmin() by: AdminUser,
  ) {
    const result = await this.emailReplies.sendAdminReply(id, by, dto);
    await this.audit.record(by, 'email_reply.send', result.reply.fromEmail, {
      subject: result.reply.subject,
    });
    return result;
  }

  @ApiOperation({
    summary: 'Simulate an incoming email reply for development or testing',
  })
  @RequireRole('admin')
  @Post('test-inbound')
  @HttpCode(200)
  async testInbound(
    @Body() dto: TestInboundReplyDto,
    @CurrentAdmin() by: AdminUser,
  ) {
    const reply = await this.emailReplies.createTestReply(dto);
    await this.audit.record(by, 'email_reply.test_inbound', dto.from, {
      subject: dto.subject,
    });
    return reply;
  }

  @ApiOperation({
    summary: 'Delete an email reply',
  })
  @ApiNoContentResponse()
  @RequireRole('admin')
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() by: AdminUser,
  ) {
    const reply = await this.emailReplies.get(id);
    await this.emailReplies.remove(id);
    await this.audit.record(by, 'email_reply.delete', reply.fromEmail, {
      subject: reply.subject,
    });
  }
}

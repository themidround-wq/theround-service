import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeController, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { EmailRepliesService } from './email-replies.service';

@ApiExcludeController()
@ApiTags('Webhooks')
@Controller('webhooks')
export class EmailWebhooksController {
  constructor(private readonly repliesService: EmailRepliesService) {}

  @Post('resend')
  @HttpCode(200)
  async handleResendWebhook(@Body() payload: Record<string, any>, @Req() req: Request) {
    // Check if this is an inbound email event
    if (payload.type && payload.type !== 'email.received') {
      // Return 200 for other Resend webhook events (e.g. delivery status)
      return { ok: true, ignored: payload.type };
    }

    const result = await this.repliesService.handleInboundWebhook(payload);
    return { ok: true, id: result.id };
  }

  @Post('email-replies')
  @HttpCode(200)
  async handleGenericWebhook(@Body() payload: Record<string, any>) {
    const result = await this.repliesService.handleInboundWebhook(payload);
    return { ok: true, id: result.id };
  }
}

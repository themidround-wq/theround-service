import { Controller, Get, HttpCode, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { escapeHtml, INK, MUTED, RULE, SANS } from '../email/templates/layout';
import { BroadcastsService } from './broadcasts.service';
import { verifyUnsubscribeToken } from './unsubscribe-token';

const page = (title: string, body: string) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" /><title>${title} · The Round</title></head>
<body style="margin:0; background:#f1f0df; font-family:${SANS}; color:${INK};">
  <main style="max-width:440px; margin:12vh auto; padding:40px 32px; background:#fff; border:1px solid ${RULE}; border-radius:20px;">
    <div style="font-size:11px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; color:${MUTED};">The Round</div>
    <h1 style="margin:12px 0 12px; font-size:28px; line-height:1.2;">${title}</h1>
    ${body}
  </main>
</body></html>`;

/**
 * Public unsubscribe link from broadcast emails. GET shows a confirm button
 * (so link scanners that prefetch URLs don't unsubscribe people); POST does
 * it, and is also what the inbox "Unsubscribe" button calls (RFC 8058).
 */
@ApiExcludeController()
@Controller('email/unsubscribe')
export class UnsubscribeController {
  private readonly secret: string;

  constructor(
    private readonly broadcasts: BroadcastsService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('JWT_SECRET');
  }

  private valid(email?: string, token?: string) {
    return (
      !!email && !!token && verifyUnsubscribeToken(email, token, this.secret)
    );
  }

  @Get()
  confirm(
    @Query('email') email: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    res.type('html');
    if (!this.valid(email, token)) {
      return res
        .status(400)
        .send(
          page(
            'Link not valid',
            `<p style="line-height:1.6; color:${MUTED};">This unsubscribe link is incomplete. Use the link from the most recent email, or reply to it and we'll take you off the list.</p>`,
          ),
        );
    }
    const action = `?${new URLSearchParams({ email, token }).toString()}`;
    return res.send(
      page(
        'Unsubscribe?',
        `<p style="line-height:1.6; color:${MUTED};">Stop newsletters and product updates to <strong style="color:${INK};">${escapeHtml(email)}</strong>. You'll still get emails about your account and essential service notices.</p>
    <form method="post" action="${escapeHtml(action)}" style="margin-top:24px;">
      <button style="border:0; border-radius:999px; background:${INK}; color:#fff; padding:14px 28px; font-family:${SANS}; font-size:15px; font-weight:600; cursor:pointer;">Unsubscribe</button>
    </form>`,
      ),
    );
  }

  @Post()
  @HttpCode(200)
  async unsubscribe(
    @Query('email') email: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    res.type('html');
    if (!this.valid(email, token)) {
      return res
        .status(400)
        .send(
          page(
            'Link not valid',
            `<p style="color:${MUTED};">This unsubscribe link is incomplete.</p>`,
          ),
        );
    }
    const oneClick =
      res.req.headers['content-type']?.includes('urlencoded') &&
      !res.req.headers['accept']?.includes('text/html');
    await this.broadcasts.unsubscribe(email, oneClick ? 'one_click' : 'link');
    return res.send(
      page(
        "You're unsubscribed",
        `<p style="line-height:1.6; color:${MUTED};">We won't send newsletters or updates to <strong style="color:${INK};">${escapeHtml(email)}</strong> any more. Changed your mind? Reply to any of our emails.</p>`,
      ),
    );
  }
}

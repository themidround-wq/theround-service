import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import type { AdminUser } from '../admin/admin.entities';
import { Broadcast, BroadcastRecipient } from '../broadcasts/broadcast.entities';
import { EmailService } from '../email/email.service';
import { SANS, INK, MUTED, RULE } from '../email/templates/layout';
import { User } from '../users/user.entity';
import {
  ListEmailRepliesDto,
  SendEmailReplyDto,
  TestInboundReplyDto,
  UpdateEmailReplyStatusDto,
} from './dto';
import {
  EmailReply,
  EmailReplyMessage,
  EmailReplyStatus,
} from './email-reply.entity';

function parseSender(fromStr?: string): { email: string; name: string | null } {
  if (!fromStr) return { email: '', name: null };
  const trimmed = fromStr.trim();
  const match = trimmed.match(/^(?:["']?(.*?)["']?\s*)?<([^>]+)>$/);
  if (match) {
    const name = match[1]?.trim() || null;
    const email = match[2]?.trim().toLowerCase() || '';
    return { email, name };
  }
  return { email: trimmed.toLowerCase(), name: null };
}

function cleanSnippet(text?: string | null, html?: string | null): string {
  const raw = text || (html ? html.replace(/<[^>]+>/g, ' ') : '');
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^(>.*|\n)+/gm, '')
    .trim()
    .slice(0, 280);
}

function wrapReplyHtml(bodyText: string, originalSubject: string): string {
  const paragraphs = bodyText
    .split(/\n\n+/)
    .map((p) => `<p style="margin: 0 0 16px; line-height: 1.6;">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin: 0; padding: 24px; font-family: ${SANS}; color: ${INK}; background: #ffffff;">
  <div style="max-width: 600px; margin: 0 auto;">
    <div style="padding-bottom: 20px; border-bottom: 1px solid ${RULE}; margin-bottom: 20px;">
      <span style="font-weight: 700; font-size: 16px; letter-spacing: -0.02em;">The Round</span>
    </div>
    <div style="font-size: 15px; color: ${INK};">
      ${paragraphs}
    </div>
    <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid ${RULE}; font-size: 12px; color: ${MUTED};">
      Replying to: <em>${originalSubject}</em>
    </div>
  </div>
</body>
</html>`;
}

@Injectable()
export class EmailRepliesService {
  private readonly logger = new Logger(EmailRepliesService.name);

  constructor(
    @InjectRepository(EmailReply)
    private readonly replies: Repository<EmailReply>,
    @InjectRepository(EmailReplyMessage)
    private readonly messages: Repository<EmailReplyMessage>,
    @InjectRepository(Broadcast)
    private readonly broadcasts: Repository<Broadcast>,
    @InjectRepository(BroadcastRecipient)
    private readonly recipients: Repository<BroadcastRecipient>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Processes inbound webhook payload (e.g. Resend `email.received`).
   */
  async handleInboundWebhook(payload: Record<string, any>) {
    this.logger.log(`Received inbound email webhook: ${JSON.stringify(payload).slice(0, 300)}`);

    const data = payload.data || payload;
    const fromRaw = data.from || data.sender || '';
    let { email: fromEmail, name: fromName } = parseSender(fromRaw);

    if (!fromEmail) {
      throw new BadRequestException('Inbound email payload must contain a valid sender');
    }

    const toRaw = Array.isArray(data.to) ? data.to[0] : data.to || '';
    let { email: toEmail } = parseSender(toRaw);

    let subject = data.subject || '(No subject)';
    let bodyText = (data.text || '').trim();
    let bodyHtml = data.html || null;
    const resendEmailId = data.email_id || data.id || null;
    let headers = data.headers || {};

    // If Resend sent the webhook without the body, fetch full content from Resend API
    if ((!bodyText && !bodyHtml) && resendEmailId) {
      try {
        const fetched = await this.emailService.getInboundEmail(resendEmailId);
        if (fetched) {
          if (fetched.text) bodyText = fetched.text.trim();
          if (fetched.html) bodyHtml = fetched.html;
          if (fetched.subject && (!subject || subject === '(No subject)')) {
            subject = fetched.subject;
          }
          if (fetched.from && !fromEmail) {
            const parsed = parseSender(fetched.from);
            fromEmail = parsed.email;
            fromName = parsed.name;
          }
          if (fetched.to && !toEmail) {
            const toStr = Array.isArray(fetched.to) ? fetched.to[0] : fetched.to;
            toEmail = parseSender(toStr).email;
          }
          if (fetched.headers) {
            headers = { ...headers, ...fetched.headers };
          }
        }
      } catch (e) {
        this.logger.warn(`Could not fetch inbound email ${resendEmailId} from Resend: ${String(e)}`);
      }
    }

    const inReplyTo =
      headers['in-reply-to'] ||
      headers['In-Reply-To'] ||
      data.in_reply_to ||
      null;
    const messageId =
      headers['message-id'] ||
      headers['Message-ID'] ||
      data.message_id ||
      null;
    const references =
      headers['references'] ||
      headers['References'] ||
      data.references ||
      null;

    // Deduplication by resendEmailId
    if (resendEmailId) {
      const existing = await this.replies.findOneBy({ resendEmailId });
      if (existing) {
        // If existing record was missing body and we now have body, backfill it
        if ((!existing.bodyText && !existing.bodyHtml) && (bodyText || bodyHtml)) {
          existing.bodyText = bodyText;
          existing.bodyHtml = bodyHtml;
          existing.snippet = cleanSnippet(bodyText, bodyHtml);
          if (subject && (!existing.subject || existing.subject === '(No subject)')) {
            existing.subject = subject;
          }
          await this.replies.save(existing);
        }
        this.logger.log(`Inbound email with Resend ID ${resendEmailId} already processed.`);
        return existing;
      }
    }

    // Match sender user
    const user = await this.users.findOne({
      where: { email: ILike(fromEmail) },
      select: { id: true, email: true, name: true },
    });

    // Match broadcast
    let broadcastId: string | null = null;
    if (inReplyTo) {
      const matchedRecipient = await this.recipients.findOne({
        where: { messageId: inReplyTo },
        relations: { broadcast: true },
      });
      if (matchedRecipient?.broadcast) {
        broadcastId = matchedRecipient.broadcast.id;
      }
    }

    if (!broadcastId && references) {
      const refList = references.split(/\s+/);
      for (const ref of refList) {
        const cleanRef = ref.replace(/[<>]/g, '');
        if (!cleanRef) continue;
        const matchedRecipient = await this.recipients.findOne({
          where: { messageId: cleanRef },
          relations: { broadcast: true },
        });
        if (matchedRecipient?.broadcast) {
          broadcastId = matchedRecipient.broadcast.id;
          break;
        }
      }
    }

    if (!broadcastId) {
      // Heuristic fallback: check if user received a broadcast recently with similar subject
      const cleanSubj = subject.replace(/^(re|fwd|fw):\s*/i, '').trim();
      if (cleanSubj) {
        const recentBroadcast = await this.broadcasts.findOne({
          where: { subject: ILike(`%${cleanSubj}%`) },
          order: { createdAt: 'DESC' },
        });
        if (recentBroadcast) {
          broadcastId = recentBroadcast.id;
        }
      }
    }

    // Threading: check if this is a reply to an existing thread
    if (inReplyTo) {
      const parentReply = await this.replies.findOne({
        where: [
          { messageId: inReplyTo },
          { messages: { resendMessageId: inReplyTo } },
        ],
      });

      if (parentReply) {
        const userMessage = this.messages.create({
          replyId: parentReply.id,
          senderType: 'user',
          senderEmail: fromEmail,
          senderName: fromName || parentReply.fromName,
          bodyText,
          bodyHtml,
          resendMessageId: messageId || resendEmailId,
        });
        await this.messages.save(userMessage);

        parentReply.status = 'unread';
        parentReply.replyCount = (parentReply.replyCount || 0) + 1;
        parentReply.snippet = cleanSnippet(bodyText, bodyHtml);
        parentReply.updatedAt = new Date();
        await this.replies.save(parentReply);
        return parentReply;
      }
    }

    // Create new EmailReply
    const snippet = cleanSnippet(bodyText, bodyHtml);
    const reply = this.replies.create({
      resendEmailId,
      messageId,
      inReplyTo,
      references: typeof references === 'string' ? references : JSON.stringify(references),
      fromEmail,
      fromName,
      toEmail: toEmail || 'replies@the-round.app',
      subject,
      bodyText,
      bodyHtml,
      snippet,
      status: 'unread',
      userId: user?.id ?? null,
      broadcastId,
      headers: JSON.stringify(headers),
      replyCount: 0,
    });

    const saved = await this.replies.save(reply);
    this.logger.log(`Created new email reply ${saved.id} from ${fromEmail}`);
    return saved;
  }

  /**
   * Ingest a test reply manually for admin testing.
   */
  async createTestReply(dto: TestInboundReplyDto) {
    return this.handleInboundWebhook({
      data: {
        from: dto.fromName ? `${dto.fromName} <${dto.from}>` : dto.from,
        to: dto.to || 'replies@the-round.app',
        subject: dto.subject,
        text: dto.text,
        html: dto.html,
        email_id: `test_${Date.now()}`,
      },
    });
  }

  async list(q: ListEmailRepliesDto) {
    const page = Math.max(1, q.page || 1);
    const limit = Math.max(1, Math.min(100, q.limit || 25));

    const qb = this.replies
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'u')
      .leftJoinAndSelect('r.broadcast', 'b');

    if (q.status && q.status !== 'all') {
      qb.andWhere('r.status = :status', { status: q.status });
    }

    if (q.broadcastId) {
      qb.andWhere('r.broadcastId = :broadcastId', { broadcastId: q.broadcastId });
    }

    if (q.userId) {
      qb.andWhere('r.userId = :userId', { userId: q.userId });
    }

    if (q.search) {
      const s = `%${q.search.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(r.fromEmail) LIKE :s OR LOWER(r.fromName) LIKE :s OR LOWER(r.subject) LIKE :s OR LOWER(r.bodyText) LIKE :s)',
        { s },
      );
    }

    qb.orderBy('r.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  async get(id: string) {
    const reply = await this.replies.findOne({
      where: { id },
      relations: {
        user: true,
        broadcast: true,
        messages: true,
      },
      order: {
        messages: {
          createdAt: 'ASC',
        },
      },
    });

    if (!reply) {
      throw new NotFoundException('Email reply not found');
    }

    // If body is missing but resendEmailId exists, backfill from Resend API
    if ((!reply.bodyText && !reply.bodyHtml) && reply.resendEmailId) {
      try {
        const fetched = await this.emailService.getInboundEmail(reply.resendEmailId);
        if (fetched && (fetched.text || fetched.html)) {
          reply.bodyText = (fetched.text || '').trim();
          reply.bodyHtml = fetched.html || null;
          reply.snippet = cleanSnippet(reply.bodyText, reply.bodyHtml);
          if (fetched.subject && (!reply.subject || reply.subject === '(No subject)')) {
            reply.subject = fetched.subject;
          }
          await this.replies.save(reply);
        }
      } catch (e) {
        this.logger.warn(`Could not backfill body for reply ${id}: ${String(e)}`);
      }
    }

    return reply;
  }

  async updateStatus(id: string, dto: UpdateEmailReplyStatusDto) {
    const reply = await this.get(id);
    reply.status = dto.status;
    return this.replies.save(reply);
  }

  async sendAdminReply(id: string, admin: AdminUser, dto: SendEmailReplyDto) {
    const reply = await this.get(id);

    const subject = reply.subject.toLowerCase().startsWith('re:')
      ? reply.subject
      : `Re: ${reply.subject}`;

    const html = wrapReplyHtml(dto.bodyText, reply.subject);
    const headers: Record<string, string> = {};

    if (reply.messageId) {
      headers['In-Reply-To'] = reply.messageId;
      headers['References'] = [reply.references, reply.messageId].filter(Boolean).join(' ');
    }

    const sendResult = await this.emailService.sendDirectReply(
      reply.fromEmail,
      subject,
      { html, text: dto.bodyText },
      headers,
    );

    if (sendResult.outcome === 'failed') {
      throw new BadRequestException(`Failed to send email reply: ${sendResult.error || 'Unknown error'}`);
    }

    const message = this.messages.create({
      replyId: reply.id,
      senderType: 'admin',
      senderEmail: admin.email,
      senderName: admin.name || 'The Round Team',
      bodyText: dto.bodyText,
      bodyHtml: html,
      resendMessageId: sendResult.messageId || null,
    });
    await this.messages.save(message);

    reply.status = 'read';
    reply.lastRepliedAt = new Date();
    reply.replyCount = (reply.replyCount || 0) + 1;
    await this.replies.save(reply);

    return {
      reply: await this.get(id),
      message,
      outcome: sendResult.outcome,
    };
  }

  async summary() {
    const [total, unread, read, archived, replied] = await Promise.all([
      this.replies.count(),
      this.replies.countBy({ status: 'unread' }),
      this.replies.countBy({ status: 'read' }),
      this.replies.countBy({ status: 'archived' }),
      this.replies.createQueryBuilder('r').where('r.lastRepliedAt IS NOT NULL').getCount(),
    ]);

    return {
      total,
      unread,
      read,
      archived,
      replied,
    };
  }

  async remove(id: string) {
    const reply = await this.get(id);
    await this.replies.remove(reply);
    return { ok: true };
  }
}

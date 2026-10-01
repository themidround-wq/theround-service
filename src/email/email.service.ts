import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { emailContextFrom } from './email.context';
import {
  EmailContext,
  firstRound,
  FirstRoundProps,
  milestone,
  MilestoneProps,
  RenderedEmail,
  waitlistInvite,
  waitlistSuccess,
  welcome,
} from './templates';

/**
 * Transactional email via Resend. Every send is best-effort: it never throws,
 * because the action that triggered it (signup, sign-in) has already
 * succeeded. Without RESEND_API_KEY, sends are logged and skipped (local dev).
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string | undefined;
  private readonly replyTo: string | undefined;
  private readonly ctx: EmailContext;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('RESEND_API_KEY');
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from = config.get<string>('RESEND_FROM');
    this.replyTo = config.get<string>('RESEND_REPLY_TO') || undefined;
    this.ctx = emailContextFrom(config);

    if (!this.resend || !this.from) {
      this.logger.warn(
        'Email disabled: set RESEND_API_KEY and RESEND_FROM to send.',
      );
    } else if (this.from.includes('resend.dev')) {
      this.logger.warn(
        'Sending from the resend.dev test domain: mail to external domains will land in spam or be rejected until a custom domain is verified in Resend.',
      );
    }
  }

  sendWaitlistSuccess(to: string, waitlistId: number, ticketNumber: number) {
    return this.send(
      to,
      waitlistSuccess(this.ctx, { ticketNumber }),
      `waitlist-success-${waitlistId}`,
    );
  }

  sendWaitlistInvite(to: string, waitlistId: number, ticketNumber: number) {
    return this.send(
      to,
      waitlistInvite(this.ctx, { ticketNumber }),
      `waitlist-invite-${waitlistId}`,
    );
  }

  sendWelcome(to: string, userId: string, name: string | null) {
    return this.send(to, welcome(this.ctx, { name }), `welcome-${userId}`);
  }

  sendFirstRound(to: string, userId: string, props: FirstRoundProps) {
    return this.send(to, firstRound(this.ctx, props), `first-round-${userId}`);
  }

  sendMilestone(to: string, userId: string, props: MilestoneProps) {
    return this.send(
      to,
      milestone(this.ctx, props),
      `milestone-${userId}-${props.totalRounds}`,
    );
  }

  /**
   * @param idempotencyKey stops a retry of the same event from double-sending
   *   (Resend remembers keys for 24 hours).
   */
  private async send(to: string, email: RenderedEmail, idempotencyKey: string) {
    if (!this.resend || !this.from) {
      this.logger.log(`Skipped "${email.subject}" to ${to} (email disabled)`);
      return;
    }

    try {
      // The SDK reports API failures in `error` rather than throwing; the
      // try/catch is only for network-level failures.
      const { data, error } = await this.resend.emails.send(
        {
          from: this.from,
          to,
          replyTo: this.replyTo,
          subject: email.subject,
          html: email.html,
          text: email.text,
          headers: {
            'List-Unsubscribe': `<${this.ctx.unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        },
        { idempotencyKey },
      );

      if (error) {
        this.logger.error(
          `"${email.subject}" to ${to} failed: ${error.message}`,
        );
        return;
      }
      this.logger.log(`Sent "${email.subject}" to ${to} (id: ${data?.id})`);
    } catch (cause) {
      this.logger.error(`"${email.subject}" to ${to} threw: ${String(cause)}`);
    }
  }
}

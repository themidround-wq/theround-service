import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { SettingsService } from '../settings/settings.service';
import type { BooleanSettingKey } from '../settings/settings';
import { emailContextFrom } from './email.context';
import {
  adminPasswordReset,
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

/** `disabled`: Resend isn't configured. `off`: an admin switched this email off. */
export type SendOutcome = 'sent' | 'failed' | 'disabled' | 'off';

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

  constructor(
    config: ConfigService,
    private readonly settings: SettingsService,
  ) {
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

  async sendWaitlistSuccess(
    to: string,
    waitlistId: number,
    ticketNumber: number,
  ) {
    if (await this.isOff('email.waitlistConfirmation')) return 'off';
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

  /** Not gated by settings: an admin must always be able to recover access. */
  sendAdminPasswordReset(
    to: string,
    resetId: string,
    url: string,
    minutes: number,
  ) {
    return this.send(
      to,
      adminPasswordReset(this.ctx, { url, minutes }),
      `admin-reset-${resetId}`,
    );
  }

  async sendWelcome(to: string, userId: string, name: string | null) {
    if (await this.isOff('email.welcome')) return 'off';
    return this.send(to, welcome(this.ctx, { name }), `welcome-${userId}`);
  }

  async sendFirstRound(to: string, userId: string, props: FirstRoundProps) {
    if (await this.isOff('email.progress')) return 'off';
    return this.send(to, firstRound(this.ctx, props), `first-round-${userId}`);
  }

  async sendMilestone(to: string, userId: string, props: MilestoneProps) {
    if (await this.isOff('email.progress')) return 'off';
    return this.send(
      to,
      milestone(this.ctx, props),
      `milestone-${userId}-${props.totalRounds}`,
    );
  }

  /** Never throws: a settings lookup failure must not block mail. */
  private async isOff(key: BooleanSettingKey) {
    try {
      return (await this.settings.get(key)) === false;
    } catch {
      return false;
    }
  }

  /**
   * @param idempotencyKey stops a retry of the same event from double-sending
   *   (Resend remembers keys for 24 hours).
   */
  private async send(
    to: string,
    email: RenderedEmail,
    idempotencyKey: string,
    headers?: Record<string, string>,
  ): Promise<SendOutcome> {
    if (!this.resend || !this.from) {
      this.logger.log(`Skipped "${email.subject}" to ${to} (email disabled)`);
      return 'disabled';
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
          headers: headers ?? {},
        },
        { idempotencyKey },
      );

      if (error) {
        this.logger.error(
          `"${email.subject}" to ${to} failed: ${error.message}`,
        );
        return 'failed';
      }
      this.logger.log(`Sent "${email.subject}" to ${to} (id: ${data?.id})`);
      return 'sent';
    } catch (cause) {
      this.logger.error(`"${email.subject}" to ${to} threw: ${String(cause)}`);
      return 'failed';
    }
  }

  // ---- broadcasts ----------------------------------------------------------

  get enabled() {
    return !!(this.resend && this.from);
  }

  /** Template context, for callers that render their own emails. */
  get context() {
    return this.ctx;
  }

  /**
   * Up to 100 emails in one Resend call. Retries rate limits and server
   * errors. Validation is permissive, so one bad address fails only itself:
   * the result has one entry per message, in order, or a single error when
   * the whole call failed.
   */
  async sendBatch(
    messages: (RenderedEmail & { to: string; unsubscribeUrl: string })[],
    idempotencyKey: string,
  ): Promise<
    { results: ({ id: string } | { error: string })[] } | { error: string }
  > {
    if (!this.resend || !this.from) return { error: 'Email is not configured' };
    const from = this.from;
    const payload = messages.map((m) => ({
      from,
      to: m.to,
      replyTo: this.replyTo,
      subject: m.subject,
      html: m.html,
      text: m.text,
      headers: {
        'List-Unsubscribe': `<${m.unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }));

    let lastError = 'Unknown error';
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      try {
        const { data, error } = await this.resend.batch.send(payload, {
          idempotencyKey,
          batchValidation: 'permissive',
        });
        if (!error) {
          // `data` lists ids for the accepted messages only, in order.
          const failed = new Map(
            (data?.errors ?? []).map((e) => [e.index, e.message]),
          );
          const ids = (data?.data ?? []).map((d) => d.id);
          let next = 0;
          return {
            results: messages.map((_, i) =>
              failed.has(i)
                ? { error: failed.get(i)! }
                : { id: ids[next++] ?? '' },
            ),
          };
        }
        lastError = error.message;
        const status = (error as { statusCode?: number | null }).statusCode;
        // Only rate limits and server errors are worth retrying.
        if (status && status !== 429 && status < 500) break;
      } catch (cause) {
        lastError = String(cause);
      }
    }
    this.logger.error(`Batch of ${messages.length} failed: ${lastError}`);
    return { error: lastError };
  }

  /** A single pre-rendered email (broadcast test sends). */
  async sendRendered(
    to: string,
    email: RenderedEmail,
    unsubscribeUrl: string,
  ): Promise<SendOutcome> {
    if (!this.enabled) return 'disabled';
    const r = await this.sendBatch(
      [{ ...email, to, unsubscribeUrl }],
      `test-${to}-${Date.now()}`,
    );
    return 'results' in r && 'id' in r.results[0] ? 'sent' : 'failed';
  }

  /**
   * Direct reply to an inbound email or user thread.
   */
  async sendDirectReply(
    to: string,
    subject: string,
    body: { html: string; text: string },
    headers?: Record<string, string>,
  ): Promise<{ outcome: SendOutcome; messageId?: string; error?: string }> {
    if (!this.resend || !this.from) {
      this.logger.log(
        `Skipped direct reply "${subject}" to ${to} (email disabled)`,
      );
      return { outcome: 'disabled' };
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to,
        replyTo: this.replyTo,
        subject,
        html: body.html,
        text: body.text,
        headers: headers ?? {},
      });

      if (error) {
        this.logger.error(
          `Reply "${subject}" to ${to} failed: ${error.message}`,
        );
        return { outcome: 'failed', error: error.message };
      }
      this.logger.log(`Sent reply "${subject}" to ${to} (id: ${data?.id})`);
      return { outcome: 'sent', messageId: data?.id };
    } catch (cause) {
      this.logger.error(`Reply "${subject}" to ${to} threw: ${String(cause)}`);
      return { outcome: 'failed', error: String(cause) };
    }
  }

  /**
   * Fetches the full inbound email (including body HTML and text) from Resend.
   */
  async getInboundEmail(emailId: string): Promise<{
    html?: string | null;
    text?: string | null;
    subject?: string;
    from?: string;
    to?: string | string[];
    headers?: Record<string, string>;
  } | null> {
    if (!this.resend) return null;
    try {
      // Try resend.emails.receiving.get(emailId) first (Resend Inbound)
      if (this.resend.emails?.receiving?.get) {
        const { data, error } = await this.resend.emails.receiving.get(emailId);
        if (!error && data) {
          return data as any;
        }
      }
      // Fallback to resend.emails.get(emailId)
      const { data, error } = await this.resend.emails.get(emailId);
      if (!error && data) {
        return data as any;
      }
      if (error) {
        this.logger.warn(
          `Failed to fetch inbound email ${emailId}: ${error.message}`,
        );
      }
      return null;
    } catch (e) {
      this.logger.error(
        `Error fetching inbound email ${emailId}: ${String(e)}`,
      );
      return null;
    }
  }
}



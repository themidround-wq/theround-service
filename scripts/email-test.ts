/**
 * Sends one template, with sample data, through Resend.
 *
 *   npm run email:test -- [template] [recipient]
 *
 * Defaults to every template, sent to delivered@resend.dev (Resend's
 * simulator sink, no real inbox involved).
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { emailContextFrom } from '../src/email/email.context';
import { SAMPLES } from '../src/email/templates';

const [only, to = 'delivered@resend.dev'] = process.argv.slice(2);
const names = only ? [only] : Object.keys(SAMPLES);
const config = new ConfigService();
const from = config.getOrThrow<string>('RESEND_FROM');
const resend = new Resend(config.getOrThrow<string>('RESEND_API_KEY'));
const ctx = emailContextFrom(config);

void (async () => {
  for (const name of names) {
    const render = SAMPLES[name as keyof typeof SAMPLES];
    if (!render) {
      console.error(
        `Unknown template "${name}". Try: ${Object.keys(SAMPLES).join(', ')}`,
      );
      process.exit(1);
    }
    const { subject, html, text } = render(ctx);
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
    });
    if (error) {
      console.error(`${name}: FAILED`, error);
      process.exit(1);
    }
    console.log(`${name}: sent to ${to} from ${from} -> id ${data?.id}`);
  }
})();

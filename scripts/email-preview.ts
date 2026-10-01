/**
 * Renders every email template to .preview/<name>.html so you can open them
 * in a browser while iterating.
 *
 *   npm run email:preview
 *
 * Browser rendering is a rough guide only - Outlook and Gmail differ. Send a
 * real test with `npm run email:test` before shipping copy or layout changes.
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { ConfigService } from '@nestjs/config';
import { emailContextFrom } from '../src/email/email.context';
import { SAMPLES } from '../src/email/templates';

const OUT_DIR = '.preview';
const ctx = emailContextFrom(new ConfigService());

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, render] of Object.entries(SAMPLES)) {
  const file = `${OUT_DIR}/${name}.html`;
  writeFileSync(file, render(ctx).html, 'utf8');
  console.log(`Wrote ${file}`);
}

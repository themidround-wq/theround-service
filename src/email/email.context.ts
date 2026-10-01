import { ConfigService } from '@nestjs/config';
import type { EmailContext } from './templates';

/** Builds the template context from env; shared by EmailService and scripts. */
export function emailContextFrom(config: ConfigService): EmailContext {
  const siteUrl = config.get<string>(
    'EMAIL_ASSET_ORIGIN',
    'https://gettheround.com',
  );
  return {
    siteUrl,
    appUrl: config.get<string>('APP_URL', siteUrl),
    unsubscribeUrl: config.get<string>(
      'RESEND_UNSUBSCRIBE_URL',
      `${siteUrl}/unsubscribe`,
    ),
    companyAddress: config.get<string>('COMPANY_ADDRESS') || undefined,
  };
}

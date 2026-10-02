import {
  button,
  EmailContext,
  heading,
  layoutHtml,
  layoutText,
  paragraph,
  RenderedEmail,
} from './layout';

/** "Forgot password" link for a dashboard admin. Expires in 30 minutes. */
export function adminPasswordReset(
  ctx: EmailContext,
  { url, minutes }: { url: string; minutes: number },
): RenderedEmail {
  const subject = 'Reset your admin password';

  const html = layoutHtml({
    ctx,
    title: subject,
    preheader: `This link works once and expires in ${minutes} minutes.`,
    body: [
      heading('Reset your password'),
      paragraph(
        'Someone asked to reset the password for your The Round admin account. If that was you, choose a new one below.',
      ),
      paragraph(
        `The link works once and expires in ${minutes} minutes. Resetting signs you out everywhere; two-factor authentication stays on.`,
      ),
      button(url, 'Choose a new password'),
      paragraph(
        "Didn't ask for this? Ignore this email: your password won't change.",
        { last: true },
      ),
    ].join(''),
  });

  const text = layoutText(ctx, [
    subject,
    '',
    'Someone asked to reset the password for your The Round admin account. If that was you, choose a new one here:',
    url,
    '',
    `The link works once and expires in ${minutes} minutes.`,
    "Didn't ask for this? Ignore this email: your password won't change.",
  ]);

  return { subject, html, text };
}

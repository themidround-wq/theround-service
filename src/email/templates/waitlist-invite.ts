import {
  button,
  EmailContext,
  heading,
  layoutHtml,
  layoutText,
  paragraph,
  RenderedEmail,
  ticket,
} from './layout';

/**
 * The "quiet invitation" the waitlist email promises: sent to waitlist
 * members when The Round opens to them.
 */
export function waitlistInvite(
  ctx: EmailContext,
  { ticketNumber }: { ticketNumber: number },
): RenderedEmail {
  const subject = 'Your seat is ready.';

  const html = layoutHtml({
    ctx,
    title: subject,
    preheader: `Ticket no. #${ticketNumber} &mdash; The Round is open to you. Your first round is waiting.`,
    body: [
      heading(subject),
      ticket(ticketNumber),
      paragraph('You asked to be told when it was time. It&rsquo;s time.'),
      paragraph(
        'The Round is open to you. Spin a topic, speak your answer out loud, and listen back. A few minutes a day builds the calm you need for the moments that matter.',
      ),
      paragraph(
        'Sign in with Google using this email address to claim your seat.',
      ),
      button(ctx.appUrl, 'Claim your seat'),
    ].join(''),
  });

  const text = layoutText(ctx, [
    subject,
    '',
    `Ticket no. #${ticketNumber}`,
    '',
    "You asked to be told when it was time. It's time.",
    '',
    'The Round is open to you. Spin a topic, speak your answer out loud, and listen back. A few minutes a day builds the calm you need for the moments that matter.',
    '',
    'Sign in with Google using this email address to claim your seat:',
    ctx.appUrl,
  ]);

  return { subject, html, text };
}

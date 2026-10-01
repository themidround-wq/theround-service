import {
  EmailContext,
  heading,
  layoutHtml,
  layoutText,
  paragraph,
  RenderedEmail,
  socials,
  socialsText,
  ticket,
} from './layout';

/** Sent once, when an email first joins the waitlist from the landing page. */
export function waitlistSuccess(
  ctx: EmailContext,
  { ticketNumber }: { ticketNumber: number },
): RenderedEmail {
  const subject = 'Your seat is held.';

  const html = layoutHtml({
    ctx,
    title: subject,
    preheader: `Your seat on The Round waitlist is confirmed &mdash; ticket no. #${ticketNumber}. We'll be in touch when it's time.`,
    body: [
      heading(subject),
      ticket(ticketNumber),
      paragraph(
        'You signed up because you want to show up better in the moments that matter most.',
      ),
      paragraph("Something good is coming. It's worth the wait."),
      paragraph(
        "We'll reach out when it's time. No noise&mdash;just a quiet invitation.",
        { last: true },
      ),
      socials(),
    ].join(''),
  });

  const text = layoutText(ctx, [
    subject,
    '',
    `Ticket no. #${ticketNumber}`,
    '',
    'You signed up because you want to show up better in the moments that matter most.',
    '',
    "Something good is coming. It's worth the wait.",
    '',
    "We'll reach out when it's time. No noise - just a quiet invitation.",
    '',
    ...socialsText(),
  ]);

  return { subject, html, text };
}

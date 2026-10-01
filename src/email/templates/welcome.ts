import {
  button,
  EmailContext,
  escapeHtml,
  heading,
  layoutHtml,
  layoutText,
  paragraph,
  RenderedEmail,
} from './layout';

/** Sent once, on a user's first Google sign-in to the app. */
export function welcome(
  ctx: EmailContext,
  { name }: { name?: string | null },
): RenderedEmail {
  const subject = "You're in.";
  const title = name ? `You're in, ${escapeHtml(name)}.` : subject;

  const html = layoutHtml({
    ctx,
    title: subject,
    preheader: 'Welcome to The Round. Your first round is one spin away.',
    body: [
      heading(title),
      paragraph('Welcome to The Round.'),
      paragraph(
        'Here&rsquo;s how it works: spin a topic, speak your answer out loud before the timer runs out, then listen back and reflect. That&rsquo;s one round.',
      ),
      paragraph(
        'Confidence on the ward isn&rsquo;t a talent. It&rsquo;s practice. A few minutes a day is enough.',
      ),
      button(ctx.appUrl, 'Start your first round'),
    ].join(''),
  });

  const text = layoutText(ctx, [
    name ? `You're in, ${name}.` : subject,
    '',
    'Welcome to The Round.',
    '',
    "Here's how it works: spin a topic, speak your answer out loud before the timer runs out, then listen back and reflect. That's one round.",
    '',
    "Confidence on the ward isn't a talent. It's practice. A few minutes a day is enough.",
    '',
    `Start your first round: ${ctx.appUrl}`,
  ]);

  return { subject, html, text };
}

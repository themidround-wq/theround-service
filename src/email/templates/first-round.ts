import type { Reflection } from '../../rounds/round.entity';
import {
  button,
  EmailContext,
  escapeHtml,
  formatDuration,
  heading,
  layoutHtml,
  layoutText,
  paragraph,
  quote,
  RenderedEmail,
  stats,
} from './layout';

/** How the user said the round went, as shown in the app. */
const REFLECTION_LABELS: Record<Reflection, string> = {
  clear: 'Clear',
  a_little_unsure: 'A little unsure',
  lost_my_structure: 'Lost my structure',
  want_another_go: 'Want another go',
};

export type FirstRoundProps = {
  name?: string | null;
  category: string;
  question: string;
  spokenSeconds?: number | null;
  reflection?: Reflection | null;
};

/** Sent once, when a user saves their first round. */
export function firstRound(
  ctx: EmailContext,
  { name, category, question, spokenSeconds, reflection }: FirstRoundProps,
): RenderedEmail {
  const subject = 'Your first round is in.';

  const rows: [string, string][] = [['Category', escapeHtml(category)]];
  if (spokenSeconds)
    rows.push(['You spoke for', formatDuration(spokenSeconds)]);
  if (reflection) rows.push(['How it felt', REFLECTION_LABELS[reflection]]);

  const opener = name
    ? `${escapeHtml(name)}, that&rsquo;s the hardest one done.`
    : 'That&rsquo;s the hardest one done.';

  const html = layoutHtml({
    ctx,
    title: subject,
    preheader: `You answered your first question on The Round. Here's how it went.`,
    body: [
      heading(subject),
      paragraph(opener),
      quote(escapeHtml(question), 'You answered'),
      stats(rows),
      paragraph(
        'Listen back to it tomorrow. You&rsquo;ll hear what to keep and what to tighten, and the next round will already be easier.',
      ),
      button(ctx.appUrl, 'Spin another round'),
    ].join(''),
  });

  const text = layoutText(ctx, [
    subject,
    '',
    name
      ? `${name}, that's the hardest one done.`
      : "That's the hardest one done.",
    '',
    'You answered:',
    `  "${question}"`,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    "Listen back to it tomorrow. You'll hear what to keep and what to tighten, and the next round will already be easier.",
    '',
    `Spin another round: ${ctx.appUrl}`,
  ]);

  return { subject, html, text };
}

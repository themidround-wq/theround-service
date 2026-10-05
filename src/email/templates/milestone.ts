import {
  button,
  EmailContext,
  escapeHtml,
  extractFirstName,
  formatTotal,
  heading,
  layoutHtml,
  layoutText,
  paragraph,
  RenderedEmail,
  stats,
} from './layout';

/** Saved-round counts that earn an email. The first round has its own. */
export const MILESTONES = [5, 10, 25, 50, 100] as const;

const LINES: Record<number, string> = {
  5: 'Five rounds in. This is where practice starts to become a habit.',
  10: 'Ten rounds. You&rsquo;re answering out loud the way you will on the ward.',
  25: 'Twenty-five rounds. Structure that once took effort is becoming instinct.',
  50: 'Fifty rounds. That&rsquo;s real, deliberate practice&mdash;most people never get here.',
  100: 'One hundred rounds. Whatever comes next, you&rsquo;ve already rehearsed it.',
};

export type MilestoneProps = {
  name?: string | null;
  totalRounds: number;
  speakingSeconds: number;
  currentStreakDays: number;
  mostPractised?: { category: string; rounds: number } | null;
};

/** Sent when a user's saved-round count reaches one of MILESTONES. */
export function milestone(
  ctx: EmailContext,
  {
    name,
    totalRounds,
    speakingSeconds,
    currentStreakDays,
    mostPractised,
  }: MilestoneProps,
): RenderedEmail {
  const firstName = extractFirstName(name);
  const subject = `${totalRounds} rounds.`;
  const line =
    LINES[totalRounds] ??
    `${totalRounds} rounds. Every one of them made the next one easier.`;

  const rows: [string, string][] = [
    ['Rounds saved', String(totalRounds)],
    ['Time speaking', formatTotal(speakingSeconds)],
  ];
  if (currentStreakDays > 1) {
    rows.push(['Current streak', `${currentStreakDays} days`]);
  }
  if (mostPractised) {
    rows.push(['Most practised', escapeHtml(mostPractised.category)]);
  }

  const html = layoutHtml({
    ctx,
    title: subject,
    preheader: `You've saved ${totalRounds} rounds on The Round. Here's what that looks like.`,
    body: [
      heading(subject),
      paragraph(firstName ? `Well done, ${escapeHtml(firstName)}.` : 'Well done.'),
      paragraph(line),
      stats(rows),
      button(ctx.appUrl, 'Keep going'),
    ].join(''),
  });

  const text = layoutText(ctx, [
    subject,
    '',
    firstName ? `Well done, ${firstName}.` : 'Well done.',
    '',
    line.replace(/&rsquo;/g, "'").replace(/&mdash;/g, ' - '),
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    `Keep going: ${ctx.appUrl}`,
  ]);

  return { subject, html, text };
}

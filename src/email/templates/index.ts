import { firstRound } from './first-round';
import type { EmailContext } from './layout';
import { milestone } from './milestone';
import { waitlistInvite } from './waitlist-invite';
import { waitlistSuccess } from './waitlist-success';
import { welcome } from './welcome';

export type { EmailContext, RenderedEmail } from './layout';
export { firstRound, milestone, waitlistInvite, waitlistSuccess, welcome };
export { MILESTONES } from './milestone';
export type { FirstRoundProps } from './first-round';
export type { MilestoneProps } from './milestone';

/**
 * Every template with sample data, for `npm run email:preview` and
 * `npm run email:test`.
 */
export const SAMPLES = {
  'waitlist-success': (ctx: EmailContext) =>
    waitlistSuccess(ctx, { ticketNumber: 1042 }),
  'waitlist-invite': (ctx: EmailContext) =>
    waitlistInvite(ctx, { ticketNumber: 1042 }),
  welcome: (ctx: EmailContext) => welcome(ctx, { name: 'Nkem' }),
  'first-round': (ctx: EmailContext) =>
    firstRound(ctx, {
      name: 'Nkem',
      category: 'Labour & Delivery',
      question:
        'A woman at 39 weeks reports reduced fetal movements. Talk me through your initial assessment.',
      spokenSeconds: 84,
      reflection: 'a_little_unsure',
    }),
  milestone: (ctx: EmailContext) =>
    milestone(ctx, {
      name: 'Nkem',
      totalRounds: 10,
      speakingSeconds: 1260,
      currentStreakDays: 4,
      mostPractised: { category: 'Labour & Delivery', rounds: 4 },
    }),
};

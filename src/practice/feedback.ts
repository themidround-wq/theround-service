/**
 * Placeholder scoring for practice rounds.
 *
 * There is no transcription or rubric model behind this yet: the score follows
 * how much of the allowed time was used (sweet spot 60–95%) with a small,
 * deterministic per-round variation, and the advice comes from a per-topic
 * rubric. Swap generateFeedback() for a real assessor (speech-to-text + LLM
 * against the rubric) without changing the response shape the app reads.
 */

export interface PracticeFeedback {
  score: number;
  verdict: string;
  summary: string;
  metrics: { label: string; score: number }[];
  worked: string[];
  workOn: { point: string; trySaying: string }[];
  examiner: { label: string; covered: boolean }[];
}

interface Rubric {
  examiner: string[];
  workOn: { point: string; trySaying: string }[];
}

const GENERIC: Rubric = {
  examiner: [
    'Clear opening structure',
    'Safety and escalation',
    'Accurate clinical detail',
    'Summary and documentation',
  ],
  workOn: [
    {
      point: 'Say your escalation point out loud — who you call, and when.',
      trySaying:
        'If I’m concerned, I’d escalate to the senior on duty straight away, using SBAR.',
    },
    {
      point: 'Close with a one-line summary of your plan.',
      trySaying: 'So in summary: assess, act, escalate, and document as I go.',
    },
  ],
};

const RUBRICS: Record<string, Rubric> = {
  labour: {
    examiner: [
      'Call for help early',
      'ABCDE and haemodynamic status',
      'Cause-based management (the 4 Ts)',
      'Escalation and documentation',
    ],
    workOn: [
      {
        point: 'Say your escalation point out loud — who you call, and when.',
        trySaying:
          'I’d escalate to the senior midwife and obstetric registrar straight away, using SBAR.',
      },
      {
        point: 'Close with a one-line summary of your plan.',
        trySaying:
          'So in summary: assess, call for help, treat the cause, and document as I go.',
      },
    ],
  },
  newborn: {
    examiner: [
      'Dry, warm and stimulate',
      'Assess tone, breathing and heart rate',
      'Airway and inflation breaths',
      'Reassess and escalate',
    ],
    workOn: [
      {
        point: 'Keep the timeline clear.',
        trySaying:
          'Within the first minute I’d dry, assess and open the airway.',
      },
      {
        point: 'State when you call for help.',
        trySaying:
          'If there’s no response to inflation breaths, I call the neonatal team.',
      },
    ],
  },
  antenatal: {
    examiner: [
      'History and risk factors',
      'Observations and screening',
      'Recognising warning signs',
      'Referral and follow-up',
    ],
    workOn: GENERIC.workOn,
  },
  emergency: {
    examiner: [
      'Airway with c-spine',
      'Breathing',
      'Circulation and haemorrhage control',
      'Disability and exposure',
    ],
    workOn: [
      {
        point: 'Keep strictly to the ABCDE order.',
        trySaying: 'I don’t move to B until A is secure.',
      },
      {
        point: 'Say when you reassess.',
        trySaying: 'After every intervention, I go back to A.',
      },
    ],
  },
};

const clock = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s) % 60).padStart(2, '0')}`;

/** Deterministic 0..1 from a string. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export function generateFeedback(input: {
  roundId: string;
  slug: string;
  spokenSeconds: number;
  durationSeconds: number;
  /** The question's own rubric points, when an admin has written them. */
  examinerPoints?: string[];
}): PracticeFeedback {
  const { roundId, spokenSeconds, durationSeconds } = input;
  const base = RUBRICS[input.slug] ?? GENERIC;
  const rubric = input.examinerPoints?.length
    ? { ...base, examiner: input.examinerPoints }
    : base;
  const ratio = spokenSeconds / durationSeconds;
  const use =
    ratio < 0.25 ? 0.45 : ratio < 0.6 ? 0.72 : ratio <= 0.95 ? 0.9 : 0.8;
  const score = Math.max(
    38,
    Math.min(96, Math.round(52 + use * 34 + hash(roundId) * 8)),
  );
  const missed = score >= 88 ? -1 : rubric.examiner.length - 1;
  const lead =
    score >= 80
      ? 'Strong answer. Clear and well structured, with a couple of small things to tighten.'
      : score >= 65
        ? 'A good start. The core is there; a clearer structure will lift it.'
        : 'You’ve made a start. Let’s build more structure and detail into the next go.';
  const metric = (label: string, i: number) => ({
    label,
    score: Math.max(
      35,
      Math.min(98, score + Math.round((hash(roundId + i) - 0.5) * 6)),
    ),
  });
  return {
    score,
    verdict:
      score >= 80 ? 'Strong answer' : score >= 65 ? 'Good start' : 'Keep going',
    summary: `${lead} You spoke for ${clock(spokenSeconds)} of your ${clock(durationSeconds)}${ratio >= 0.6 ? ', using your time well.' : '.'}`,
    metrics: [
      metric('Structure', 1),
      metric('Clarity', 2),
      metric('Clinical accuracy', 3),
      metric('Confidence', 4),
    ],
    worked: [
      'You opened with a clear structure, so it was easy to follow.',
      'You put safety first — exactly what examiners listen for.',
      ratio >= 0.6
        ? 'Your pace stayed calm and steady.'
        : 'You stayed focused on the question.',
    ],
    workOn: rubric.workOn,
    examiner: rubric.examiner.map((label, i) => ({
      label,
      covered: i !== missed,
    })),
  };
}

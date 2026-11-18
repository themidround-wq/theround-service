import { normaliseFeedback, type MarkingInput } from './marking.service';
import { AssessmentService } from './assessment.service';
import { speechMetrics } from './speech';
import type { Round } from '../rounds/round.entity';
import type { User } from '../users/user.entity';

const round = (over: Partial<Round> = {}) =>
  ({
    id: 'r-1',
    audioKey: 'u/r-1.webm',
    audioMime: 'audio/webm',
    spokenSeconds: 70,
    durationSeconds: 90,
    category: { name: 'Labour & Delivery', slug: 'labour' },
    topic: { name: 'Postpartum haemorrhage' },
    question: {
      text: 'How would you recognise and manage a postpartum haemorrhage?',
      rubric: {
        examinerPoints: ['Call for help', 'Fundal massage', 'Document'],
        keyFacts: [],
        modelAnswer: null,
      },
    },
    ...over,
  }) as unknown as Round;
const user = { stage: 'student', course: 'Midwifery' } as User;

function build(
  settings: Record<string, unknown>,
  opts: {
    transcribe?: jest.Mock;
    mark?: jest.Mock;
    missing?: string | null;
  } = {},
) {
  const transcription = {
    missingConfig: () => opts.missing ?? null,
    transcribe:
      opts.transcribe ??
      jest.fn().mockResolvedValue({
        text: 'I would call for help um and rub up the fundus',
        words: [],
        provider: 'whisper',
        model: 'whisper-large-v3',
      }),
  };
  const marking = {
    missingConfig: () => null,
    mark:
      opts.mark ??
      jest.fn().mockResolvedValue({
        feedback: {
          score: 77,
          verdict: 'Good start',
          summary: 'Good.',
          metrics: [],
          worked: [],
          workOn: [],
          examiner: [],
        },
        model: 'qwen3-32b',
        usage: { inputTokens: 900, outputTokens: 400, cacheReadTokens: 0 },
        costUsd: 0.0004,
      }),
  };
  const svc = new AssessmentService(
    {
      all: () =>
        Promise.resolve({
          'ai.marking': true,
          'ai.transcription': 'whisper',
          'ai.markingModel': 'open',
          ...settings,
        }),
    } as never,
    { read: () => Promise.resolve(Buffer.from('a')) } as never,
    transcription as never,
    marking as never,
  );
  return { svc, transcription, marking };
}

describe('AssessmentService', () => {
  it('transcribes, measures and marks against the question rubric', async () => {
    const { svc, marking } = build({});
    const a = await svc.assess(round(), user, 'labour');
    expect(a.source).toBe('ai');
    expect(a.transcript).toContain('call for help');
    expect(a.feedback.score).toBe(77);
    const [model, input] = marking.mark.mock.calls[0] as [string, MarkingInput];
    expect(model).toBe('open');
    expect(input.rubric?.examinerPoints).toEqual([
      'Call for help',
      'Fundal massage',
      'Document',
    ]);
    expect(input.metrics.fillers).toBe(1);
    expect(a.meta).toMatchObject({
      transcription: { provider: 'whisper' },
      marking: { model: 'qwen3-32b' },
      costUsd: 0.0004,
    });
  });

  it('uses the placeholder (no reason) when AI marking is off', async () => {
    const { svc, marking } = build({ 'ai.marking': false });
    const a = await svc.assess(round(), user, 'labour');
    expect(a.source).toBe('placeholder');
    expect(a.meta.reason).toBeNull();
    expect(marking.mark).not.toHaveBeenCalled();
    // Placeholder still uses the question's own rubric points.
    expect(a.feedback.examiner.map((e) => e.label)).toEqual([
      'Call for help',
      'Fundal massage',
      'Document',
    ]);
  });

  it('falls back with a reason when a provider is not configured or fails', async () => {
    const missing = await build({}, { missing: 'WHISPER_BASE_URL' }).svc.assess(
      round(),
      user,
      'labour',
    );
    expect(missing).toMatchObject({
      source: 'placeholder',
      meta: { reason: 'Not configured: WHISPER_BASE_URL' },
    });

    const failing = build(
      {},
      {
        mark: jest
          .fn()
          .mockRejectedValue(new Error('Open model 503: overloaded')),
      },
    );
    const a = await failing.svc.assess(round(), user, 'labour');
    expect(a.source).toBe('placeholder');
    expect(a.meta.reason).toBe('AI marking failed: Open model 503: overloaded');
    expect(a.transcript).toContain('call for help'); // kept for the admin
  });

  it('skips AI when there is no recording', async () => {
    const a = await build({}).svc.assess(
      round({ audioKey: null }),
      user,
      'labour',
    );
    expect(a.meta.reason).toBe('No recording (microphone unavailable)');
  });
});

describe('normaliseFeedback', () => {
  it('clamps scores, fixes metric labels and aligns examiner points to the rubric', () => {
    const fb = normaliseFeedback(
      {
        score: 140,
        summary: ' Solid. ',
        metrics: [
          { label: 'Clarity', score: -5 },
          { label: 'Made up', score: 50 },
        ],
        worked: ['a', '', 'b', 'c', 'd'],
        workOn: [
          { point: 'Escalate', trySaying: 'I would call the registrar.' },
        ],
        examiner: [
          { label: 'fundal massage', covered: true },
          { label: 'Something else', covered: true },
        ],
      },
      {
        examinerPoints: ['Call for help', 'Fundal massage'],
        keyFacts: [],
        modelAnswer: null,
      },
    );
    expect(fb.score).toBe(100);
    expect(fb.verdict).toBe('Strong answer');
    expect(fb.summary).toBe('Solid.');
    expect(fb.metrics.map((m) => m.label)).toEqual([
      'Structure',
      'Clarity',
      'Clinical accuracy',
      'Confidence',
    ]);
    expect(fb.metrics[1].score).toBe(0);
    expect(fb.worked).toEqual(['a', 'b', 'c']);
    expect(fb.examiner).toEqual([
      { label: 'Call for help', covered: false },
      { label: 'Fundal massage', covered: true },
    ]);
  });
});

describe('speechMetrics', () => {
  it('measures pace, fillers and long pauses from word timings', () => {
    const words = [
      { word: 'I', start: 0, end: 0.2 },
      { word: 'um', start: 0.3, end: 0.5 },
      { word: 'would', start: 3, end: 3.3 },
      { word: 'you', start: 3.4, end: 3.5 },
      { word: 'know', start: 3.6, end: 4 },
    ];
    expect(speechMetrics('', words, 10)).toEqual({
      words: 5,
      wordsPerMinute: 75,
      fillers: 2,
      longPauses: 1,
      timed: true,
    });
  });
});

/** Word timings from a transcriber, in seconds. */
export interface TimedWord {
  word: string;
  start: number;
  end: number;
}

export interface SpeechMetrics {
  words: number;
  /** Words per minute over the time actually spoken. */
  wordsPerMinute: number;
  /** "um", "uh", "er", "you know"… */
  fillers: number;
  /** Silences of 2 s or more between words. */
  longPauses: number;
  /** True when word timings were available; otherwise pace is estimated. */
  timed: boolean;
}

const FILLER = /^(um+|uh+|er+|erm+|ah+|hmm+|mm+)$/i;

/**
 * Delivery metrics measured from the transcript, not judged by a model.
 * They feed the Confidence and Clarity sub-scores.
 */
export function speechMetrics(
  text: string,
  words: TimedWord[],
  spokenSeconds: number,
): SpeechMetrics {
  const tokens = words.length
    ? words.map((w) => w.word)
    : text.split(/\s+/).filter(Boolean);
  const clean = tokens.map((t) => t.toLowerCase().replace(/[^a-z']/g, ''));
  let fillers = clean.filter((t) => FILLER.test(t)).length;
  for (let i = 0; i < clean.length - 1; i++)
    if (clean[i] === 'you' && clean[i + 1] === 'know') fillers++;
  let longPauses = 0;
  for (let i = 1; i < words.length; i++)
    if (words[i].start - words[i - 1].end >= 2) longPauses++;
  const duration = words.length
    ? Math.max(1, words[words.length - 1].end - words[0].start)
    : Math.max(1, spokenSeconds);
  return {
    words: tokens.length,
    wordsPerMinute: Math.round((tokens.length / duration) * 60),
    fillers,
    longPauses,
    timed: words.length > 0,
  };
}

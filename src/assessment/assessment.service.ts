import { Injectable, Logger } from '@nestjs/common';
import { generateFeedback, type PracticeFeedback } from '../practice/feedback';
import type { Round } from '../rounds/round.entity';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import type { User } from '../users/user.entity';
import { MarkingService, type MarkingModel } from './marking.service';
import { speechMetrics } from './speech';
import {
  TranscriptionService,
  type TranscriptionProvider,
} from './transcription.service';

export interface Assessment {
  feedback: PracticeFeedback;
  transcript: string | null;
  source: 'ai' | 'placeholder';
  meta: Record<string, unknown>;
}

/**
 * Turns a recorded answer into feedback: speech-to-text → measured delivery
 * metrics → rubric marking. Providers and model come from admin Settings
 * (ai.marking, ai.transcription, ai.markingModel). Anything missing or failing
 * falls back to the placeholder scorer so the student always gets feedback;
 * the reason is kept in markingMeta for the admin.
 */
@Injectable()
export class AssessmentService {
  private readonly logger = new Logger(AssessmentService.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
    private readonly transcription: TranscriptionService,
    private readonly marking: MarkingService,
  ) {}

  /** What the admin Settings page shows next to the AI switches. */
  async status() {
    const s = await this.settings.all();
    const provider = s['ai.transcription'] as TranscriptionProvider;
    const model = s['ai.markingModel'] as MarkingModel;
    return {
      enabled: s['ai.marking'],
      transcription: {
        provider,
        missing: this.transcription.missingConfig(provider),
      },
      marking: {
        model,
        openModelName: process.env.OPEN_MODEL_NAME ?? null,
        missing: this.marking.missingConfig(model),
      },
    };
  }

  async assess(round: Round, user: User, slug: string): Promise<Assessment> {
    const placeholder = (
      reason: string | null,
      extra: Record<string, unknown> = {},
    ): Assessment => ({
      feedback: generateFeedback({
        roundId: round.id,
        slug,
        spokenSeconds: round.spokenSeconds ?? 1,
        durationSeconds: round.durationSeconds,
        examinerPoints: round.question.rubric?.examinerPoints,
      }),
      transcript: (extra.transcript as string | undefined) ?? null,
      source: 'placeholder',
      meta: { reason, ...extra, transcript: undefined },
    });

    const s = await this.settings.all();
    if (!s['ai.marking']) return placeholder(null);
    if (!round.audioKey || !round.audioMime)
      return placeholder('No recording (microphone unavailable)');

    const provider = s['ai.transcription'] as TranscriptionProvider;
    const model = s['ai.markingModel'] as MarkingModel;
    const missing =
      this.transcription.missingConfig(provider) ??
      this.marking.missingConfig(model);
    if (missing) return placeholder(`Not configured: ${missing}`);

    const started = Date.now();
    let transcript: string | undefined;
    try {
      const audio = await this.storage.read(round.audioKey);
      const t = await this.transcription.transcribe(
        provider,
        audio,
        round.audioMime,
      );
      transcript = t.text;
      const metrics = speechMetrics(t.text, t.words, round.spokenSeconds ?? 1);
      const marked = await this.marking.mark(model, {
        category: round.category.name,
        topic: round.topic.name,
        question: round.question.text,
        stage: user.stage,
        course: user.course,
        durationSeconds: round.durationSeconds,
        spokenSeconds: round.spokenSeconds ?? 1,
        transcript: t.text,
        metrics,
        rubric: round.question.rubric,
      });
      return {
        feedback: marked.feedback,
        transcript: t.text,
        source: 'ai',
        meta: {
          transcription: { provider: t.provider, model: t.model },
          marking: { model: marked.model, ...marked.usage },
          metrics,
          rubric: Boolean(round.question.rubric),
          costUsd: Number(marked.costUsd.toFixed(5)),
          ms: Date.now() - started,
        },
      };
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      this.logger.warn(`AI marking failed for round ${round.id}: ${reason}`);
      return placeholder(`AI marking failed: ${reason}`, {
        transcript,
        ms: Date.now() - started,
      });
    }
  }
}

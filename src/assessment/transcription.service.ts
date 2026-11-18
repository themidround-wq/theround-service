import { Injectable, Logger } from '@nestjs/common';
import type { TimedWord } from './speech';

export type TranscriptionProvider = 'deepgram' | 'assemblyai' | 'whisper';

export interface Transcript {
  text: string;
  words: TimedWord[];
  provider: TranscriptionProvider;
  model: string;
}

const TIMEOUT_MS = 90_000;

/**
 * Speech-to-text behind one interface, switchable from admin Settings
 * (ai.transcription):
 *
 * - deepgram    DEEPGRAM_API_KEY, DEEPGRAM_MODEL (default nova-3-medical)
 * - assemblyai  ASSEMBLYAI_API_KEY, ASSEMBLYAI_SPEECH_MODEL (optional)
 * - whisper     any OpenAI-compatible /audio/transcriptions endpoint running an
 *               open-source Whisper: self-hosted (faster-whisper-server,
 *               LocalAI, vLLM) or hosted (e.g. Groq). WHISPER_BASE_URL,
 *               WHISPER_MODEL (default whisper-large-v3), WHISPER_API_KEY (optional)
 */
@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);

  /** Missing configuration for a provider, or null when it's ready. */
  missingConfig(provider: TranscriptionProvider): string | null {
    if (provider === 'deepgram')
      return process.env.DEEPGRAM_API_KEY ? null : 'DEEPGRAM_API_KEY';
    if (provider === 'assemblyai')
      return process.env.ASSEMBLYAI_API_KEY ? null : 'ASSEMBLYAI_API_KEY';
    return process.env.WHISPER_BASE_URL ? null : 'WHISPER_BASE_URL';
  }

  async transcribe(
    provider: TranscriptionProvider,
    audio: Buffer,
    mime: string,
  ): Promise<Transcript> {
    const started = Date.now();
    const result =
      provider === 'deepgram'
        ? await this.deepgram(audio, mime)
        : provider === 'assemblyai'
          ? await this.assemblyai(audio)
          : await this.whisper(audio, mime);
    this.logger.log(
      `Transcribed with ${provider}/${result.model} in ${Date.now() - started} ms`,
    );
    return result;
  }

  private async deepgram(audio: Buffer, mime: string): Promise<Transcript> {
    const model = process.env.DEEPGRAM_MODEL || 'nova-3-medical';
    const url = new URL('https://api.deepgram.com/v1/listen');
    url.search = new URLSearchParams({
      model,
      smart_format: 'true',
      filler_words: 'true',
      language: 'en',
    }).toString();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': mime,
      },
      body: new Uint8Array(audio),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok)
      throw new Error(
        `Deepgram ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    const body = (await res.json()) as {
      results?: {
        channels?: {
          alternatives?: {
            transcript?: string;
            words?: {
              word: string;
              punctuated_word?: string;
              start: number;
              end: number;
            }[];
          }[];
        }[];
      };
    };
    const alt = body.results?.channels?.[0]?.alternatives?.[0];
    return {
      text: alt?.transcript ?? '',
      words: (alt?.words ?? []).map((w) => ({
        word: w.punctuated_word ?? w.word,
        start: w.start,
        end: w.end,
      })),
      provider: 'deepgram',
      model,
    };
  }

  private async assemblyai(audio: Buffer): Promise<Transcript> {
    const key = process.env.ASSEMBLYAI_API_KEY!;
    const base = 'https://api.assemblyai.com/v2';
    const up = await fetch(`${base}/upload`, {
      method: 'POST',
      headers: {
        Authorization: key,
        'Content-Type': 'application/octet-stream',
      },
      body: new Uint8Array(audio),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!up.ok)
      throw new Error(
        `AssemblyAI upload ${up.status}: ${(await up.text()).slice(0, 200)}`,
      );
    const { upload_url } = (await up.json()) as { upload_url: string };

    const speechModel = process.env.ASSEMBLYAI_SPEECH_MODEL;
    const created = await fetch(`${base}/transcript`, {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio_url: upload_url,
        language_code: 'en',
        disfluencies: true,
        ...(speechModel ? { speech_model: speechModel } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!created.ok)
      throw new Error(
        `AssemblyAI ${created.status}: ${(await created.text()).slice(0, 200)}`,
      );
    const { id } = (await created.json()) as { id: string };

    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const poll = await fetch(`${base}/transcript/${id}`, {
        headers: { Authorization: key },
        signal: AbortSignal.timeout(15_000),
      });
      const t = (await poll.json()) as {
        status: string;
        text?: string;
        error?: string;
        words?: { text: string; start: number; end: number }[];
        speech_model?: string;
      };
      if (t.status === 'completed') {
        return {
          text: t.text ?? '',
          words: (t.words ?? []).map((w) => ({
            word: w.text,
            start: w.start / 1000,
            end: w.end / 1000,
          })),
          provider: 'assemblyai',
          model: t.speech_model ?? speechModel ?? 'default',
        };
      }
      if (t.status === 'error') throw new Error(`AssemblyAI: ${t.error}`);
    }
    throw new Error('AssemblyAI: timed out');
  }

  private async whisper(audio: Buffer, mime: string): Promise<Transcript> {
    const base = process.env.WHISPER_BASE_URL!.replace(/\/+$/, '');
    const model = process.env.WHISPER_MODEL || 'whisper-large-v3';
    const form = new FormData();
    const ext = mime.includes('mp4')
      ? 'm4a'
      : mime.includes('ogg')
        ? 'ogg'
        : mime.includes('wav')
          ? 'wav'
          : 'webm';
    form.set(
      'file',
      new Blob([new Uint8Array(audio)], { type: mime }),
      `answer.${ext}`,
    );
    form.set('model', model);
    form.set('language', 'en');
    form.set('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    const res = await fetch(`${base}/audio/transcriptions`, {
      method: 'POST',
      headers: process.env.WHISPER_API_KEY
        ? { Authorization: `Bearer ${process.env.WHISPER_API_KEY}` }
        : {},
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok)
      throw new Error(
        `Whisper ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    const body = (await res.json()) as {
      text?: string;
      words?: { word: string; start: number; end: number }[];
    };
    return {
      text: (body.text ?? '').trim(),
      words: (body.words ?? []).map((w) => ({
        word: w.word.trim(),
        start: w.start,
        end: w.end,
      })),
      provider: 'whisper',
      model,
    };
  }
}

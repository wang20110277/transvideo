// 字幕板块 v1 开放清单(spec §7 Phase 1);后续版本在此扩表。
// 引擎 id 取自移植树 TranscriptionEngine 的子集(type-only,经 @smartsub/*)。
import type { TranscriptionEngine } from '@smartsub/types/engine';

/** v1 开放的转写引擎(builtin=内置 whisper.cpp;cloud=云端听写) */
export type SubtitleEngineId = Extract<TranscriptionEngine, 'builtin' | 'cloud'>;

export const SUBTITLE_ENGINES: readonly SubtitleEngineId[] = ['builtin', 'cloud'];
export const SUBTITLE_TRANSLATION_PROVIDERS = [
  'bingFree', 'googleFree', 'deepseek', 'gemini', 'qwen', 'ollama', 'openai',
] as const;
export const SUBTITLE_TTS_PROVIDERS = [] as const; // Phase 2 开放

export function filterProviders<T extends { id: string }>(
  list: T[],
  allowed: readonly string[],
): T[] {
  return list.filter((item) => allowed.includes(item.id));
}

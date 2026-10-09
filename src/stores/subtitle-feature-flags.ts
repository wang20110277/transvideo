// 字幕板块 v1 开放清单(spec §7 Phase 1);后续版本在此扩表。
// 引擎 id 取自移植树 TranscriptionEngine 的子集(type-only,经 @smartsub/*)。
import type { TranscriptionEngine } from '@smartsub/types/engine';

/** v1 开放的转写引擎(builtin=内置 whisper.cpp;cloud=云端听写) */
export type SubtitleEngineId = Extract<TranscriptionEngine, 'builtin' | 'cloud'>;

export const SUBTITLE_ENGINES: readonly SubtitleEngineId[] = ['builtin', 'cloud'];
// 翻译服务商白名单:id 须与树内内置实例 id 完全一致(PROVIDER_TYPES 的 type.id,
// Task 12 查证对齐)——'Gemini' 为树内大小写;上游无 'openai' 内置实例(仅
// CONFIG_TEMPLATES 自定义模板,v1 未开自定义流程),故不在清单。OpenAI 兼容
// 端点当前经云 ASR 实例(OpenAI Compatible)可用,翻译侧自定义入口后续再开。
export const SUBTITLE_TRANSLATION_PROVIDERS = [
  'bingFree', 'googleFree', 'deepseek', 'Gemini', 'qwen', 'ollama',
] as const;
export const SUBTITLE_TTS_PROVIDERS = [] as const; // Phase 2 开放

export function filterProviders<T extends { id: string }>(
  list: T[],
  allowed: readonly string[],
): T[] {
  return list.filter((item) => allowed.includes(item.id));
}

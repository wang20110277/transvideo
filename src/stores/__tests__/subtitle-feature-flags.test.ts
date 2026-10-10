import { describe, it, expect } from 'vitest';
import { filterProviders, SUBTITLE_TRANSLATION_PROVIDERS, SUBTITLE_ENGINES } from '@/stores/subtitle-feature-flags';

describe('subtitle feature flags', () => {
  it('v1 只放行白名单引擎与服务商(id 对齐树内内置实例)', () => {
    expect(SUBTITLE_ENGINES).toEqual(['builtin', 'cloud']);
    // 'Gemini' 为树内 PROVIDER_TYPES 实际大小写;'openai' 树内无内置实例(仅自定义模板),不在清单
    expect(SUBTITLE_TRANSLATION_PROVIDERS).toEqual([
      'bingFree', 'googleFree', 'deepseek', 'Gemini', 'qwen', 'ollama',
    ]);
    expect(SUBTITLE_TRANSLATION_PROVIDERS).not.toContain('baidu');
    expect(SUBTITLE_TRANSLATION_PROVIDERS).not.toContain('openai');
  });
  it('filterProviders 按白名单过滤(大小写敏感)', () => {
    const list = [{ id: 'bingFree' }, { id: 'baidu' }, { id: 'deepseek' }, { id: 'Gemini' }];
    expect(filterProviders(list, SUBTITLE_TRANSLATION_PROVIDERS)).toEqual([
      { id: 'bingFree' }, { id: 'deepseek' }, { id: 'Gemini' },
    ]);
  });
});

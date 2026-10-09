import { describe, it, expect } from 'vitest';
import { filterProviders, SUBTITLE_TRANSLATION_PROVIDERS, SUBTITLE_ENGINES } from '@/stores/subtitle-feature-flags';

describe('subtitle feature flags', () => {
  it('v1 只放行白名单引擎与服务商', () => {
    expect(SUBTITLE_ENGINES).toEqual(['builtin', 'cloud']);
    expect(SUBTITLE_TRANSLATION_PROVIDERS).toContain('bingFree');
    expect(SUBTITLE_TRANSLATION_PROVIDERS).not.toContain('baidu');
  });
  it('filterProviders 按白名单过滤', () => {
    const list = [{ id: 'bingFree' }, { id: 'baidu' }, { id: 'deepseek' }];
    expect(filterProviders(list, SUBTITLE_TRANSLATION_PROVIDERS)).toEqual([
      { id: 'bingFree' }, { id: 'deepseek' },
    ]);
  });
});

import { describe, it, expect } from 'vitest';
import { mainNavItems } from '@/stores/media-panel-store';

describe('mainNavItems 导航顺序', () => {
  it('字幕紧跟剪辑下方(剪辑完成添加字幕的工作流顺序)', () => {
    const editorIndex = mainNavItems.findIndex((item) => item.id === 'editor');
    const subtitleIndex = mainNavItems.findIndex((item) => item.id === 'subtitle');
    expect(editorIndex).toBeGreaterThanOrEqual(0);
    expect(subtitleIndex).toBe(editorIndex + 1);
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  registerSubtitleHandoff,
  invokeSubtitleHandoff,
  hasSubtitleHandoff,
} from '@editor/host-bridge';

afterEach(() => registerSubtitleHandoff(null));

describe('subtitle handoff 桥(编辑器导出 → 宿主字幕板块)', () => {
  it('未注册时 invoke 返回 false 不抛错', async () => {
    expect(hasSubtitleHandoff()).toBe(false);
    await expect(invokeSubtitleHandoff(new ArrayBuffer(0), 'a.mp4')).resolves.toBe(false);
  });

  it('注册后 invoke 透传 buffer 与文件名并返回 handler 结果', async () => {
    const handler = vi.fn().mockResolvedValue(true);
    registerSubtitleHandoff(handler);
    expect(hasSubtitleHandoff()).toBe(true);
    const buffer = new ArrayBuffer(8);
    await expect(invokeSubtitleHandoff(buffer, '成片.mp4')).resolves.toBe(true);
    expect(handler).toHaveBeenCalledWith(buffer, '成片.mp4');
  });

  it('register(null) 注销后再 invoke 返回 false', async () => {
    registerSubtitleHandoff(vi.fn().mockResolvedValue(true));
    registerSubtitleHandoff(null);
    expect(hasSubtitleHandoff()).toBe(false);
    await expect(invokeSubtitleHandoff(new ArrayBuffer(0), 'a.mp4')).resolves.toBe(false);
  });

  it('handler 抛错时 invoke 返回 false 而不是 reject', async () => {
    registerSubtitleHandoff(vi.fn().mockRejectedValue(new Error('落盘失败')));
    await expect(invokeSubtitleHandoff(new ArrayBuffer(0), 'a.mp4')).resolves.toBe(false);
  });
});

// src/lib/__tests__/smartsub-ipc.test.ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

describe('smartsub-ipc wrapper', () => {
  it('wrapper 用到的通道都存在于 CHANNELS.md(或为 smartsub: 前缀自有通道)', () => {
    const source = readFileSync(path.resolve(__dirname, '../smartsub-ipc.ts'), 'utf8');
    const used = [...source.matchAll(/\.(?:invoke|send|on)\('([^']+)'/g)].map((m) => m[1]);
    const documented = readFileSync(
      path.resolve(__dirname, '../../../electron/services/smartsub/CHANNELS.md'), 'utf8',
    );
    for (const ch of used) {
      const known = ch.startsWith('smartsub:') || documented.includes(`\`${ch}\``);
      expect(known, `通道 ${ch} 未在 CHANNELS.md 登记`).toBe(true);
    }
    expect(used.length).toBeGreaterThan(10);
  });
});

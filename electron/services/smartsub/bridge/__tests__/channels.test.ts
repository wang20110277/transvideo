import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../../..'); // 仓库根

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

function collectChannels(files: string[]): Set<string> {
  const channels = new Set<string>();
  const re = /ipcMain\.(?:handle|on)\(\s*'([^']+)'/g;
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(re)) channels.add(m[1]);
  }
  return channels;
}

describe('smartsub IPC 通道与宿主零冲突', () => {
  it('两集合不相交', () => {
    const hostFiles = [
      ...walk(path.join(ROOT, 'electron'), []).filter(
        (f) => !f.includes(path.join('services', 'smartsub')),
      ),
    ];
    const smartsubFiles = walk(path.join(ROOT, 'electron/services/smartsub'));
    const host = collectChannels(hostFiles);
    const sub = collectChannels(smartsubFiles);
    const overlap = [...host].filter((c) => sub.has(c));
    expect(overlap, `通道冲突: ${overlap.join(', ')}`).toEqual([]);
  });

  it('smartsub:init 已注册且归属移植树', () => {
    const smartsubFiles = walk(path.join(ROOT, 'electron/services/smartsub'));
    expect(collectChannels(smartsubFiles)).toContain('smartsub:init');
  });
});

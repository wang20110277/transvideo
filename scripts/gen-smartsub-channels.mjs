// node scripts/gen-smartsub-channels.mjs > electron/services/smartsub/CHANNELS.md
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
const ROOT = 'electron/services/smartsub';
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    statSync(p).isDirectory() ? walk(p, out) : /\.ts$/.test(n) && out.push(p);
  }
  return out;
}
const rows = [];
for (const f of walk(ROOT)) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/ipcMain\.(handle|on)\(\s*'([^']+)'/g)) {
    rows.push([m[2], m[1] === 'handle' ? 'invoke' : 'send', path.relative(ROOT, f)]);
  }
}
rows.sort((a, b) => a[0].localeCompare(b[0]));
console.log('# SmartSub IPC 通道清单(生成物,勿手改)\n');
console.log('| 通道 | 方向 | 注册处 |');
console.log('|---|---|---|');
for (const [ch, dir, file] of rows) console.log(`| \`${ch}\` | ${dir} | ${file} |`);

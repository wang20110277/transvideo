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
  // 主进程 → 渲染进程推送(webContents.send):renderer 可经 ipcRenderer.on 订阅。
  // 这类通道没有 ipcMain 注册点,只扫 handle/on 会漏(如模型下载进度),故单独索引。
  for (const m of text.matchAll(/webContents\.send\(\s*'([^']+)'/g)) {
    rows.push([m[1], 'push', path.relative(ROOT, f)]);
  }
}
rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
// push 通道每处 webContents.send 都会命中,同通道去重(保留首个注册处)
const seen = new Set();
const unique = rows.filter((row) => {
  const key = row.slice(0, 2).join('|');
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
console.log('# SmartSub IPC 通道清单(生成物,勿手改)\n');
console.log('| 通道 | 方向 | 注册处 |');
console.log('|---|---|---|');
for (const [ch, dir, file] of unique) console.log(`| \`${ch}\` | ${dir} | ${file} |`);

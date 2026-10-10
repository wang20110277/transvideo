// 一次性搬运:rsync 保留结构 + 排除清单 + userData codemod + 偏差登记
// 用法: node scripts/port-smartsub.mjs /path/to/SmartSub
import { cpSync, readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2];
const DST_ROOT = 'electron/services/smartsub';
const HELPERS_EXCLUDE = new Set([
  'videoDownload', 'toolbox', '__tests__', 'create-window.ts', 'menu.ts', 'updater.ts',
  'windowChrome.ts', 'windowClose.ts', 'windowCloseDecision.ts', 'appBranding.ts',
  'buildInfo.ts', 'ipcProofreadHandlers.ts', 'ipcVideoDownloadHandlers.ts',
  'proofreadStore.ts', 'proofreadDraftStore.ts', 'qualityReviewStore.ts', 'proofreadWaveform.ts',
  // 脚本修复#3: index.ts 桶文件 re-export 被排除的 create-window,且移植树内无消费方
  // (上游唯一消费方 background.ts 未搬运);Task 4 bridge 建桩后如需桶文件可再评估
  'index.ts',
]);
// 说明: proofreadData.ts 保留——ipcHandlers.ts 依赖其纯数据格式函数

const dirs = [
  ['main/helpers', 'helpers', (name) => !HELPERS_EXCLUDE.has(name)],
  ['main/service', 'service', () => true],
  ['main/translate', 'translate', () => true],
  ['main/glossary', 'glossary', () => true],
  ['types', 'types', () => true],
  ['main/automation', 'automation', (name) => name === 'handlers.ts' || name === 'events.ts'],
];

mkdirSync(DST_ROOT, { recursive: true });
for (const [srcRel, dstRel, keep] of dirs) {
  const srcDir = path.join(SRC, srcRel);
  for (const name of readdirSync(srcDir)) {
    if (!keep(name)) continue;
    cpSync(path.join(srcDir, name), path.join(DST_ROOT, dstRel, name), { recursive: true });
  }
}

// 脚本修复#2a: 补搬数据文件 fasterWhisperModels.json(helpers/fasterWhisperModelCatalog.ts
// 依赖的纯数据 JSON;镜像源仓库 renderer/lib 相对位置,供下方路径 codemod 统一改写)
cpSync(
  path.join(SRC, 'renderer/lib/fasterWhisperModels.json'),
  path.join(DST_ROOT, 'renderer/lib/fasterWhisperModels.json'),
);

// 脚本修复#5: 断链补搬——保留文件被已移植文件 import 时按「保留被依赖文件」原则补搬
// (数据/纯逻辑类;窗口/菜单/MCP 类不补,见下方 menu 桩)。每次补搬在任务报告登记一行。
// [file, importer(s)]
const EXTRA_FILES = [
  // buildInfo: 被 addonVersions.ts / ipcStoreHandlers.ts / systemInfoManager.ts import(getBuildInfo)
  ['main/helpers/buildInfo.ts', 'helpers/buildInfo.ts'],
  // toolbox 三件: 被 subtitleMerger.ts / compose/composeRunner.ts import(probeVideoInfo / scanEmbeddedSubtitles)
  ['main/helpers/toolbox/videoTrimmer.ts', 'helpers/toolbox/videoTrimmer.ts'],
  ['main/helpers/toolbox/embeddedSubtitleExtractor.ts', 'helpers/toolbox/embeddedSubtitleExtractor.ts'],
  ['main/helpers/toolbox/outputPath.ts', 'helpers/toolbox/outputPath.ts'],
  // videoDownload 闭环: workItemHandlers.ts import cancelDownloadBatch(scheduler),
  // 其余为 scheduler 的传递依赖(纯下载引擎逻辑,无窗口/菜单)
  ['main/helpers/videoDownload/scheduler.ts', 'helpers/videoDownload/scheduler.ts'],
  ['main/helpers/videoDownload/pipeline.ts', 'helpers/videoDownload/pipeline.ts'],
  ['main/helpers/videoDownload/pipelineReadiness.ts', 'helpers/videoDownload/pipelineReadiness.ts'],
  ['main/helpers/videoDownload/engineAdapter.ts', 'helpers/videoDownload/engineAdapter.ts'],
  ['main/helpers/videoDownload/parsers.ts', 'helpers/videoDownload/parsers.ts'],
  ['main/helpers/videoDownload/cookieProfileStore.ts', 'helpers/videoDownload/cookieProfileStore.ts'],
  ['main/helpers/videoDownload/cookies.ts', 'helpers/videoDownload/cookies.ts'],
  ['main/helpers/videoDownload/ytDlpAdapter.ts', 'helpers/videoDownload/ytDlpAdapter.ts'],
  ['main/helpers/videoDownload/luxAdapter.ts', 'helpers/videoDownload/luxAdapter.ts'],
];
for (const [srcRel, dstRel] of EXTRA_FILES) {
  cpSync(path.join(SRC, srcRel), path.join(DST_ROOT, dstRel));
}

// 脚本修复#4: smartsubPaths.ts 是宿主文件(不在 SmartSub 源内),脚本自举创建,
// 保证重跑(上游同步)时无需人工重建
if (!existsSync(path.join(DST_ROOT, 'helpers/smartsubPaths.ts'))) {
  writeFileSync(
    path.join(DST_ROOT, 'helpers/smartsubPaths.ts'),
    `import path from 'path';
import { app } from 'electron';

/** SmartSub 移植树专用存储根(与宿主 userData 隔离;spec §2) */
export function smartsubUserData(): string {
  return path.join(app.getPath('userData'), 'smartsub');
}
`,
  );
}

// 脚本修复#6: menu 桩——ipcStoreHandlers.ts import rebuildAppMenu('./menu'),
// menu.ts 为窗口/菜单类(按计划排除,真实搬入会连带 appBranding 且会在宿主内
// 重建 transvideo 应用菜单)。以 no-op 桩占位,Task 4+ 视需要接通;登记 README 已知偏差。
if (!existsSync(path.join(DST_ROOT, 'helpers/menu.ts'))) {
  writeFileSync(
    path.join(DST_ROOT, 'helpers/menu.ts'),
    `// bridge 桩(Task 3 落位):上游 main/helpers/menu.ts 为窗口/菜单类,按迁移计划不搬运。
// 宿主应用菜单由 transvideo 自管;SmartSub 语言切换触发的菜单重建在宿主内为 no-op。
// Task 4+ 若需 SmartSub 风格菜单,在此接通(参见 README 已知偏差)。
export function rebuildAppMenu(_language?: string): void {
  /* no-op by design */
}
`,
  );
}

// 脚本修复#8: 全局 BodyInit 补充——本树 tsconfig 不含 lib.dom(避开 TS≥5.7 对
// Buffer → DOM BodyInit 的 ArrayBuffer 协变收紧,service/asr 四处 fetch(body: Buffer)
// 会因此 TS2769),改用 Node(undici)全局 fetch;上游 gladia.ts 显式引用全局 BodyInit
// (DOM lib 名称),以 undici 语义补全局别名。undici-types 随 @types/node 必然在场。
if (!existsSync(path.join(DST_ROOT, 'host-fetch-types.d.ts'))) {
  writeFileSync(
    path.join(DST_ROOT, 'host-fetch-types.d.ts'),
    `// 宿主类型补充(Task 3):smartsub 树 tsconfig 不含 lib.dom,主进程 fetch 走
// Node(undici)全局类型;上游 service/asr/gladia.ts 显式引用全局 BodyInit,
// 此处以 undici 语义补该全局别名。删除本文件会使 gladia.ts 两处 TS2304。
declare global {
  type BodyInit = import('undici-types').BodyInit;
}
export {};
`,
  );
}

// userData codemod: app.getPath('userData') → smartsubUserData()
// 并按文件深度插入相对 import
function walk(dir, cb) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    name.isDirectory() ? walk(p, cb) : cb(p);
  }
}
walk(DST_ROOT, (file) => {
  if (!file.endsWith('.ts') || file.endsWith('.d.ts')) return;
  // 脚本修复#1: 跳过 smartsubPaths.ts 本体——其函数体含 userData 字面量,改写会造成自递归
  if (path.relative(DST_ROOT, file) === path.join('helpers', 'smartsubPaths.ts')) return;
  let text = readFileSync(file, 'utf8');
  if (!text.includes("app.getPath('userData')")) return;
  const depth = path.relative(path.dirname(file), DST_ROOT).split(path.sep).length;
  const rel = Array(depth).fill('..').join('/') || '.';
  text = text.replaceAll("app.getPath('userData')", 'smartsubUserData()');
  // 插在首行 use strict / shebang 之后的最前面即可(TS import 提升无顺序约束)
  text = `import { smartsubUserData } from '${rel}/helpers/smartsubPaths';\n` + text;
  writeFileSync(file, text);
});

// 脚本修复#2b: 布局路径 codemod —— SmartSub 仓库中 types/ 与 renderer/lib/ 位于仓库根,
// main/ 下任意深度文件经 N 级 '../' 攀升引用它们;镜像到 smartsub/ 后 main/ 的子目录
// 变为 smartsub/ 直接子目录,攀升深度一律减一。规则:仅命中 ≥2 级攀升的 types/renderer
// 引用(单级 '../types' 是 translate/types 等本地目录,两侧深度一致,不可动)。
let layoutFixed = 0;
for (const dir of ['helpers', 'service', 'translate', 'glossary', 'automation']) {
  walk(path.join(DST_ROOT, dir), (file) => {
    if (!file.endsWith('.ts') || file.endsWith('.d.ts')) return;
    let text = readFileSync(file, 'utf8');
    const before = text;
    text = text.replace(/'(\.\.\/){2,}types/g, (m) => m.replace(/^'(\.\.\/)/, "'"));
    text = text.replace(/'(\.\.\/){2,}renderer\//g, (m) => m.replace(/^'(\.\.\/)/, "'"));
    if (text !== before) {
      writeFileSync(file, text);
      layoutFixed++;
    }
  });
}
console.log(`layout codemod: ${layoutFixed} files rewritten`);

// 脚本修复#7(brief Step 4 的脚本化): helpers/utils.ts getExtraResourcesPath 根路径适配。
// 只改两个分支的根路径(打包 → extraResources/smartsub;开发 → resources),
// 与 brief Step 4 给定语义一致;写成脚本步骤保证上游同步重跑不丢失。
const utilsPath = path.join(DST_ROOT, 'helpers/utils.ts');
{
  const text = readFileSync(utilsPath, 'utf8');
  const OLD = `export const getExtraResourcesPath = () => {
  // A production renderer can also run from \`nextron build --no-pack\`.
  // Only packaged apps have resources copied into Electron's Resources folder.
  return app.isPackaged
    ? path.join(process.resourcesPath, 'extraResources')
    : path.join(app.getAppPath(), 'extraResources');
};`;
  const NEW = `export const getExtraResourcesPath = () => {
  // 打包: resources/extraResources/smartsub(见 Task 7 的 builder 配置)
  // 开发: 仓库根 resources(Task 7 建立;资源未放时不致命)
  return app.isPackaged
    ? path.join(process.resourcesPath, 'extraResources', 'smartsub')
    : path.join(app.getAppPath(), 'resources');
};`;
  if (text.includes(OLD)) {
    writeFileSync(utilsPath, text.replace(OLD, NEW));
    console.log('getExtraResourcesPath: adapted (dev #2)');
  } else if (text.includes(NEW)) {
    console.log('getExtraResourcesPath: already adapted');
  } else {
    console.log('WARN: getExtraResourcesPath source shape changed upstream — manual re-adaptation needed');
  }
}

// 健康检查:残留 userData 直调必须为 0(smartsubPaths.ts 本体除外——它是唯一合法直调点)
let residual = 0;
walk(DST_ROOT, (file) => {
  if (path.relative(DST_ROOT, file) === path.join('helpers', 'smartsubPaths.ts')) return;
  if (file.endsWith('.ts') && readFileSync(file, 'utf8').includes("app.getPath('userData')")) residual++;
});
console.log(residual === 0 ? 'codemod OK' : `FAIL: ${residual} residual`);
process.exit(residual === 0 ? 0 : 1);

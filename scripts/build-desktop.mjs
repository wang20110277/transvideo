import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const releaseDir = resolve(projectRoot, 'release');
const defaultBuildOutputDir = resolve(releaseDir, 'build');
const cacheRoot = resolve(projectRoot, '.cache');
const tempDir = resolve(cacheRoot, 'tmp');
const electronCacheDir = resolve(cacheRoot, 'electron');
const electronBuilderCacheDir = resolve(cacheRoot, 'electron-builder');
const cliArgs = process.argv.slice(2);
const supportedTargets = ['mac', 'win', 'linux'];
const supportedArchs = ['x64', 'arm64', 'universal', 'ia32', 'armv7l'];
const requestedTarget = cliArgs
  .find((arg) => supportedTargets.includes(arg.replace(/^--/, '')))
  ?.replace(/^--/, '');
const requestedArchs = cliArgs
  .filter((arg) => supportedArchs.includes(arg.replace(/^--/, '')))
  .map((arg) => arg.replace(/^--/, ''));
const platformToTarget = {
  darwin: 'mac',
  win32: 'win',
  linux: 'linux',
};
const buildTarget = requestedTarget || platformToTarget[process.platform];
const buildStamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
const logoPath = resolve(projectRoot, 'logo.png');
const iconPngPath = resolve(projectRoot, 'build', 'icon.png');
const iconIcoPath = resolve(projectRoot, 'build', 'icon.ico');
const iconIcnsPath = resolve(projectRoot, 'build', 'icon.icns');

if (!supportedTargets.includes(buildTarget || '')) {
  console.error(
    `Unsupported desktop target "${buildTarget ?? process.platform}". Use one of --mac, --win, or --linux.`,
  );
  process.exit(1);
}

for (const directory of [releaseDir, tempDir, electronCacheDir, electronBuilderCacheDir]) {
  mkdirSync(directory, { recursive: true });
}

const env = {
  ...process.env,
  TEMP: tempDir,
  TMP: tempDir,
  ELECTRON_CACHE: electronCacheDir,
  ELECTRON_BUILDER_CACHE: electronBuilderCacheDir,
};

function run(command, args) {
  const result = spawnSync(
    process.platform === 'win32' ? 'cmd.exe' : command,
    process.platform === 'win32' ? ['/d', '/s', '/c', [command, ...args].join(' ')] : args,
    {
      cwd: projectRoot,
      env,
      stdio: 'inherit',
    },
  );

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function normalizeArch(arch) {
  return arch === 'arm' ? 'armv7l' : arch;
}

function resolveBuilderArgs(arch) {
  const builderArgs = [];

  switch (buildTarget) {
    case 'mac':
      builderArgs.push('--mac');
      break;
    case 'win':
      builderArgs.push('--win');
      break;
    case 'linux':
      builderArgs.push('--linux');
      break;
    default:
      break;
  }

  if (arch) {
    builderArgs.push(`--${arch}`);
  }

  return builderArgs;
}

function resolveBuildArchs() {
  if (requestedArchs.length > 0) {
    return [...new Set(requestedArchs)];
  }

  return [normalizeArch(process.arch)];
}

function resolveFinalBuildOutputDir(arch) {
  return resolve(defaultBuildOutputDir, `${buildTarget}-${arch}`);
}

function resolveStagingBuildOutputDir(arch) {
  return resolve(releaseDir, `build-staging-${buildTarget}-${arch}-${buildStamp}`);
}

function shouldGenerateIcons() {
  if (!existsSync(logoPath)) {
    return false;
  }

  if (!existsSync(iconPngPath) || !existsSync(iconIcoPath)) {
    return true;
  }

  return buildTarget === 'mac' && !existsSync(iconIcnsPath);
}

function tryRemoveDirectory(directory) {
  if (!existsSync(directory)) {
    return true;
  }

  try {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    return true;
  } catch {
    return false;
  }
}

function finalizeBuildOutput(stagingBuildOutputDir, finalBuildOutputDir) {
  if (!existsSync(stagingBuildOutputDir)) {
    return;
  }

  mkdirSync(defaultBuildOutputDir, { recursive: true });

  if (tryRemoveDirectory(finalBuildOutputDir)) {
    try {
      renameSync(stagingBuildOutputDir, finalBuildOutputDir);
      console.log(`Build artifacts available at ${finalBuildOutputDir}`);
      return;
    } catch {
    }
  }

  console.warn(
    `Build artifacts were created at ${stagingBuildOutputDir} because ${finalBuildOutputDir} is still locked.`,
  );
}

// smartsub 打包断言:资源与 ffmpeg 二进制必须在包内(spec §6)
// 在 electron-builder 产物目录内定位 unpacked 应用目录:mac 为 *.app(位于 mac[-arch]/ 下,
// 目录名以 electron-builder 实际输出为准),win/linux 为 *-unpacked。
function findUnpackedAppDir(buildOutputDir) {
  const queue = [buildOutputDir];

  for (let depth = 0; queue.length > 0 && depth < 5; depth += 1) {
    for (const current of [...queue]) {
      queue.shift();
      let entries;
      try {
        entries = readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const fullPath = resolve(current, entry.name);
        const isMacApp = buildTarget === 'mac' && entry.name.endsWith('.app');
        const isUnpackedDir = buildTarget !== 'mac' && entry.name.endsWith('-unpacked');
        if (isMacApp || isUnpackedDir) {
          return fullPath;
        }
        queue.push(fullPath);
      }
    }
  }

  return null;
}

function assertSmartsubResources(buildOutputDir, arch) {
  const unpackedAppDir = findUnpackedAppDir(buildOutputDir);

  if (!unpackedAppDir) {
    console.error(
      `[smartsub] 打包断言失败:${buildOutputDir} 内找不到 unpacked 应用目录(buildTarget=${buildTarget})`,
    );
    process.exit(1);
  }

  const resourcesDir =
    buildTarget === 'mac' ? join(unpackedAppDir, 'Contents', 'Resources') : join(unpackedAppDir, 'resources');
  // whisper 原生 addon:转写主路径必需,构建期由 scripts/smartsub/fetch-whisper-addon.mjs 落地。
  // 按平台产物:darwin x64 / win x64 / linux x64 均为 addon.node;darwin arm64 另有 addon.coreml.node。
  const addonChecks = [join(resourcesDir, 'extraResources', 'smartsub', 'addons', 'addon.node')];
  if (arch === 'arm64') {
    addonChecks.push(join(resourcesDir, 'extraResources', 'smartsub', 'addons', 'addon.coreml.node'));
  }
  const checks = [
    join(resourcesDir, 'extraResources', 'smartsub', 'sherpa'),
    join(resourcesDir, 'extraResources', 'smartsub', 'ggml-silero-v6.2.0.bin'),
    join(resourcesDir, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static'),
    ...addonChecks,
  ];
  const missing = checks.filter((p) => !existsSync(p));
  if (missing.length) {
    console.error('[smartsub] 打包断言失败,缺失:\n' + missing.join('\n'));
    process.exit(1);
  }
  assertSmartsubMainBundle();
  console.log(`[smartsub] 打包断言通过 (${buildTarget}-${arch}, ${unpackedAppDir})`);
}

/**
 * SmartSub 主进程 bundle 守卫:单文件 bundle 内不允许残留相对路径惰性 require。
 * 树内 `require('./store')` 式惰性引用(为纯函数单测而设)在 rollup 单文件产物里
 * 运行时相对 out/main/index.cjs 解析 → Cannot find module(Task 12 真机实测
 * getSystemInfo 首调即崩);electron.vite.config.ts 的
 * smartsubLazyRelativeRequirePlugin 负责改写为提升 import,此处断言防止上游
 * 同步引入新的惰性 require 变体静默漏改。
 */
function assertSmartsubMainBundle() {
  const mainBundle = resolve(projectRoot, 'out', 'main', 'index.cjs');
  if (!existsSync(mainBundle)) {
    console.error(`[smartsub] 打包断言失败:找不到主进程 bundle ${mainBundle}(先跑 electron-vite build)`);
    process.exit(1);
  }
  const source = readFileSync(mainBundle, 'utf8');
  const offenders = source.match(/require\(\s*['"]\.\.?\/[^'"]*['"]\s*\)/g) || [];
  if (offenders.length > 0) {
    console.error(
      `[smartsub] 打包断言失败:主进程 bundle 残留 ${offenders.length} 处相对惰性 require(应已被 smartsubLazyRelativeRequirePlugin 改写):\n` +
        offenders.slice(0, 5).join('\n'),
    );
    process.exit(1);
  }
}

/**
 * smartsub 原生二进制构建期 fetch:在 electron-vite build 之后、electron-builder 打包之前
 * 对 host 平台拉取 whisper addon + sherpa native 到 smartsub-resources/,再经 extraResources
 * 打进包内。whisper addon 是转写主路径必需(缺它打包断言必失败),sherpa native 是本地
 * sherpa 引擎(funasr/qwen/parakeet)依赖、非内置 whisper 路径,上游仅 GitHub 单源无镜像回退。
 */
function fetchSmartsubNativeBinaries() {
  const whisperFetch = resolve(projectRoot, 'scripts', 'smartsub', 'fetch-whisper-addon.mjs');
  const sherpaFetch = resolve(projectRoot, 'scripts', 'smartsub', 'fetch-sherpa-native.mjs');

  const whisper = spawnSync(process.execPath, [whisperFetch], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  });
  if (whisper.error || (whisper.status ?? 1) !== 0) {
    console.error(
      '[smartsub] whisper addon 拉取失败(转写主路径必需,打包将中止)。\n' +
        '  手动补齐:node scripts/smartsub/fetch-whisper-addon.mjs\n' +
        '  镜像源  :--source=gitcode 或 --source=ghproxy(或环境变量 ADDON_DOWNLOAD_SOURCE=gitcode)\n' +
        '  产物    :smartsub-resources/addons/addon.node(darwin-arm64 另含 addon.coreml.node)\n' +
        '  源仓库  :GitHub buxuku/whisper.cpp release `latest` / GitCode buxuku1/whisper.node release `latest`',
    );
    process.exit(whisper.status ?? 1);
  }

  // sherpa native:非转写主路径,失败仅告警不阻断打包(上游无镜像回退,网络受限环境常见)。
  const sherpa = spawnSync(process.execPath, [sherpaFetch], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  });
  if (sherpa.error || (sherpa.status ?? 1) !== 0) {
    console.warn(
      '[smartsub] 警告:sherpa native 拉取失败(不影响内置 whisper 转写主路径)。\n' +
        '  手动补齐:node scripts/smartsub/fetch-sherpa-native.mjs\n' +
        '  产物    :smartsub-resources/sherpa/native/<platformKey>/sherpa-onnx.node\n' +
        '  源仓库  :GitHub buxuku/smartsub-py-engine release `sherpa-libs-latest`',
    );
  }
}

function buildForArch(arch) {
  const stagingBuildOutputDir = resolveStagingBuildOutputDir(arch);
  const finalBuildOutputDir = resolveFinalBuildOutputDir(arch);

  run('npx', ['electron-builder', ...resolveBuilderArgs(arch), `-c.directories.output=${stagingBuildOutputDir}`]);
  finalizeBuildOutput(stagingBuildOutputDir, finalBuildOutputDir);
  // 产物可能因目录锁定留在 staging(finalizeBuildOutput 已告警),断言取实际存在者
  assertSmartsubResources(existsSync(finalBuildOutputDir) ? finalBuildOutputDir : stagingBuildOutputDir, arch);
}

if (shouldGenerateIcons()) {
  run('node', [resolve(projectRoot, 'scripts', 'generate-icon.mjs')]);
}

const buildArchs = resolveBuildArchs();

run('npx', ['electron-vite', 'build']);

// smartsub 原生二进制(whisper addon 必需 / sherpa native 次要)须在打包前就位
fetchSmartsubNativeBinaries();

for (const arch of buildArchs) {
  buildForArch(arch);
}

#!/usr/bin/env node
/**
 * 构建期拉取 sherpa-onnx 原生库到 resources/sherpa/native/<platformKey>/。
 *
 * 本地 sherpa ASR 引擎共用 sherpa-onnx 原生运行库。过去它在运行时下载
 * 到 userData（下载/重签/自检失败面大）；现改为**随安装包内置**（像 whisper.cpp 的
 * addon.node 一样走资源目录，asar 内 .node 不可 dlopen 的限制只针对 asar，
 * 资源目录不受限）。transvideo 下资源根目录是 resources/（electron-builder
 * extraResources 块把它映射进包内 extraResources/smartsub/），等价于上游 extraResources/。
 *
 * 用法：
 *   node scripts/smartsub/fetch-sherpa-native.mjs               # 已有同版本产物时跳过下载
 *   node scripts/smartsub/fetch-sherpa-native.mjs --force       # 强制重新下载
 *
 * 架构说明：默认取 host 平台/架构的原生库。electron-builder 为每个目标平台在其原生
 * runner 上打包（CI matrix / 本机），host 即目标。需要交叉打包时在对应平台 runner 上运行。
 *
 * macOS：构建期把 @rpath 依赖改写为 @loader_path（同目录解析）并 ad-hoc 重签，随后由
 * electron-builder 的 Developer ID 签名 / 公证覆盖（取代旧的运行时 ad-hoc 重签）。
 *
 * 下载 / 重签逻辑与 fetch-whisper-addon.mjs 共用 native-download.mjs。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as tar from 'tar';
import {
  download,
  fetchText,
  sha256,
  resignMacNodes,
  readFetchMarker,
  writeFetchMarker,
} from './native-download.mjs';

// 与 electron/services/smartsub/helpers/sherpaOnnx/sherpaLibPaths.ts 的
// SHERPA_VERSION 保持一致。
const SHERPA_VERSION = '1.13.2';
const SHERPA_TAG = 'sherpa-libs-latest';
const SHERPA_REPO = 'buxuku/smartsub-py-engine';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 与 getSherpaPlatformKey() 一致：darwin-<arch> / win-x64 / linux-<arch>。 */
function getPlatformKey() {
  const arch = process.arch === 'ia32' ? 'ia32' : process.arch;
  if (process.platform === 'win32') {
    return `win-${arch === 'arm64' ? 'x64' : arch}`;
  }
  if (process.platform === 'darwin') return `darwin-${arch}`;
  return `linux-${arch}`;
}

function assetName(platformKey) {
  return `smartsub-sherpa-onnx-${platformKey}-${SHERPA_VERSION}.tar.gz`;
}

function releaseUrl(asset) {
  return `https://github.com/${SHERPA_REPO}/releases/download/${SHERPA_TAG}/${asset}`;
}

async function main() {
  const platformKey = getPlatformKey();
  const asset = assetName(platformKey);
  const outDir = path.join(
    root,
    'resources',
    'sherpa',
    'native',
    platformKey,
  );
  const tmp = path.join(os.tmpdir(), asset);
  const nativePath = path.join(outDir, 'sherpa-onnx.node');

  // 同版本产物已在位 → 跳过下载(版本升级或 --force 时才重新拉)。
  if (
    !process.argv.includes('--force') &&
    readFetchMarker(outDir) === SHERPA_VERSION &&
    fs.existsSync(nativePath)
  ) {
    console.log(
      `sherpa native ${SHERPA_VERSION} already present at ${outDir}, skip fetch (--force to refetch)`,
    );
    return;
  }

  console.log(`Fetching ${asset} ...`);
  await download(releaseUrl(asset), tmp);

  // 校验 SHA256（远端 .sha256 不可用时跳过，不阻断本地开发）。
  try {
    const text = await fetchText(`${releaseUrl(asset)}.sha256`);
    const expected = (text.trim().match(/^([a-fA-F0-9]{64})/) || [])[1];
    if (expected) {
      const actual = sha256(tmp);
      if (actual !== expected.toLowerCase()) {
        throw new Error(`sherpa checksum mismatch: ${expected} vs ${actual}`);
      }
      console.log('checksum OK');
    }
  } catch (e) {
    console.warn(`sherpa .sha256 verify skipped: ${e}`);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  await tar.extract({ file: tmp, cwd: outDir });
  fs.rmSync(tmp, { force: true });

  resignMacNodes(outDir);

  if (!fs.existsSync(nativePath)) {
    throw new Error(`sherpa-onnx.node missing in ${outDir} after extract`);
  }
  writeFetchMarker(outDir, SHERPA_VERSION);
  console.log(`sherpa native ready at ${outDir} (${platformKey})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

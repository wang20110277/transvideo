/**
 * 统一存储根目录解析单元测试(openspec: unified-storage-root)。
 *
 * 移植自 SmartSub scripts/test-storage-paths.ts(手写 eq 断言脚本 → vitest):
 * 断言语义不变(JSON 深比较 → toEqual),仅改造为 describe/it 结构。
 *
 * 覆盖:
 * - resolveStorageLocation 三级优先级与 source 判定、trim 判空语义
 * - STORAGE_SUBPATHS 逐引擎子路径映射(resolveModelRoot)
 * - faster-whisper 自包含运行时跟随 storageRoot,并在未设置时回退 userData
 * - resolveTempDir 三级优先级(自定义 > storageRoot/temp > 系统默认)
 * - containsCjk / validateStoragePath 正反例(中文/CJK 标点/全角/纯英文/西文变音符/空串)
 * - isFactoryDefaultGgmlPath 归一化判定(等于出厂默认删除、自定义保留)
 * - sanitizeStoragePathPatch CJK 兜底(路径键剔除、非路径键透传)
 */
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  resolveStorageLocation,
  resolveModelRoot,
  resolvePyEnginesRoot,
  resolveTempDir,
  isFactoryDefaultGgmlPath,
  sanitizeStoragePathPatch,
  STORAGE_SUBPATHS,
  type StorageKind,
} from '../storagePaths';
import { containsCjk, validateStoragePath } from '../../types/pathValidation';

const USER_DATA = path.join('/base', 'userData');
const ROOT = path.join('/vol', 'SmartSub');

describe('resolveStorageLocation:三级优先级与 source(design D1/D3)', () => {
  it('override wins over storageRoot', () => {
    expect(
      resolveStorageLocation({
        override: '/custom/models',
        storageRoot: ROOT,
        subpath: ['whisper-models'],
        defaultBase: USER_DATA,
      }),
    ).toEqual({ path: '/custom/models', source: 'override' });
  });

  it('storageRoot + subpath when no override', () => {
    expect(
      resolveStorageLocation({
        override: undefined,
        storageRoot: ROOT,
        subpath: ['whisper-models'],
        defaultBase: USER_DATA,
      }),
    ).toEqual({
      path: path.join(ROOT, 'whisper-models'),
      source: 'storageRoot',
    });
  });

  it('default base fallback', () => {
    expect(
      resolveStorageLocation({
        subpath: ['whisper-models'],
        defaultBase: USER_DATA,
      }),
    ).toEqual({
      path: path.join(USER_DATA, 'whisper-models'),
      source: 'default',
    });
  });

  it('blank override + empty root treated as unset', () => {
    expect(
      resolveStorageLocation({
        override: '   ',
        storageRoot: '',
        subpath: ['models', 'funasr'],
        defaultBase: USER_DATA,
      }),
    ).toEqual({
      path: path.join(USER_DATA, 'models', 'funasr'),
      source: 'default',
    });
  });

  it('storageRoot trimmed before join', () => {
    expect(
      resolveStorageLocation({
        override: '',
        storageRoot: `  ${ROOT}  `,
        subpath: ['temp'],
        defaultBase: USER_DATA,
      }),
    ).toEqual({ path: path.join(ROOT, 'temp'), source: 'storageRoot' });
  });
});

describe('STORAGE_SUBPATHS / resolveModelRoot:逐引擎映射(design D2)', () => {
  const expectedSubpaths: Record<StorageKind, string[]> = {
    ggml: ['whisper-models'],
    ct2: ['faster-whisper-models'],
    funasr: ['models', 'funasr'],
    qwen: ['models', 'qwen'],
    firered: ['models', 'firered'],
    parakeet: ['models', 'parakeet'],
    tts: ['models', 'tts'],
  };

  (Object.keys(expectedSubpaths) as StorageKind[]).forEach((kind) => {
    it(`subpath: ${kind} matches legacy default layout`, () => {
      expect(STORAGE_SUBPATHS[kind]).toEqual(expectedSubpaths[kind]);
    });
    it(`modelRoot: ${kind} follows storageRoot`, () => {
      expect(resolveModelRoot(kind, { storageRoot: ROOT }, USER_DATA)).toEqual({
        path: path.join(ROOT, ...expectedSubpaths[kind]),
        source: 'storageRoot',
      });
    });
    it(`modelRoot: ${kind} default without settings`, () => {
      expect(resolveModelRoot(kind, undefined, USER_DATA)).toEqual({
        path: path.join(USER_DATA, ...expectedSubpaths[kind]),
        source: 'default',
      });
    });
  });

  it('modelRoot: ct2 override key mapped correctly', () => {
    expect(
      resolveModelRoot(
        'ct2',
        { fasterWhisperModelsPath: '/ct2/override', storageRoot: ROOT },
        USER_DATA,
      ),
    ).toEqual({ path: '/ct2/override', source: 'override' });
  });

  it('modelRoot: ggml override key mapped correctly', () => {
    expect(
      resolveModelRoot(
        'ggml',
        { modelsPath: '/ggml/override', storageRoot: ROOT },
        USER_DATA,
      ),
    ).toEqual({ path: '/ggml/override', source: 'override' });
  });
});

describe('resolvePyEnginesRoot:faster-whisper 自包含运行时(storageRoot > userData)', () => {
  it('runtime follows storageRoot', () => {
    expect(resolvePyEnginesRoot({ storageRoot: ROOT }, USER_DATA)).toEqual({
      path: path.join(ROOT, 'py-engines'),
      source: 'storageRoot',
    });
  });

  it('blank storageRoot falls back to userData', () => {
    expect(resolvePyEnginesRoot({ storageRoot: '   ' }, USER_DATA)).toEqual({
      path: path.join(USER_DATA, 'py-engines'),
      source: 'default',
    });
  });

  it('missing settings keeps legacy default', () => {
    expect(resolvePyEnginesRoot(undefined, USER_DATA)).toEqual({
      path: path.join(USER_DATA, 'py-engines'),
      source: 'default',
    });
  });
});

describe('resolveTempDir:三级优先级(design D5)', () => {
  const SYS_TEMP = path.join('/sys', 'tmp');

  it('explicit custom dir wins over storageRoot', () => {
    expect(
      resolveTempDir({
        useCustomTempDir: true,
        customTempDir: '/my/tmp',
        storageRoot: ROOT,
        systemTempDir: SYS_TEMP,
      }),
    ).toEqual({ path: '/my/tmp', source: 'override' });
  });

  it('toggle off falls to storageRoot/temp', () => {
    expect(
      resolveTempDir({
        useCustomTempDir: false,
        customTempDir: '/my/tmp',
        storageRoot: ROOT,
        systemTempDir: SYS_TEMP,
      }),
    ).toEqual({ path: path.join(ROOT, 'temp'), source: 'storageRoot' });
  });

  it('blank custom dir ignored even when toggled on', () => {
    expect(
      resolveTempDir({
        useCustomTempDir: true,
        customTempDir: '   ',
        storageRoot: ROOT,
        systemTempDir: SYS_TEMP,
      }),
    ).toEqual({ path: path.join(ROOT, 'temp'), source: 'storageRoot' });
  });

  it('system default keeps whisper-subtitles subdir', () => {
    expect(resolveTempDir({ systemTempDir: SYS_TEMP })).toEqual({
      path: path.join(SYS_TEMP, 'whisper-subtitles'),
      source: 'default',
    });
  });
});

describe('containsCjk / validateStoragePath(design D6)', () => {
  it('chinese chars detected', () => {
    expect(containsCjk('D:\\模型\\whisper')).toBe(true);
  });
  it('chinese username detected', () => {
    expect(containsCjk('/Users/张三/Library')).toBe(true);
  });
  it('cjk punctuation detected', () => {
    expect(containsCjk('D:\\models\\、test')).toBe(true);
  });
  it('fullwidth forms detected', () => {
    expect(containsCjk('D:\\ｍｏｄｅｌｓ')).toBe(true);
  });
  it('ascii path passes', () => {
    expect(containsCjk('D:\\SmartSub\\models')).toBe(false);
  });
  it('latin diacritics not blocked', () => {
    expect(containsCjk('/home/Média/tôt')).toBe(false);
  });
  it('empty string passes', () => {
    expect(containsCjk('')).toBe(false);
  });
  it('validate: cjk path rejected with reason', () => {
    expect(validateStoragePath('D:\\统一存储')).toEqual({
      ok: false,
      reason: 'cjk',
    });
  });
  it('validate: ascii path accepted', () => {
    expect(validateStoragePath('D:\\SmartSub')).toEqual({ ok: true });
  });
});

describe('isFactoryDefaultGgmlPath:归一化判定(design D4-2)', () => {
  it('factory default path detected', () => {
    expect(
      isFactoryDefaultGgmlPath(path.join(USER_DATA, 'whisper-models'), USER_DATA),
    ).toBe(true);
  });
  it('custom path preserved', () => {
    expect(isFactoryDefaultGgmlPath('/custom/ggml', USER_DATA)).toBe(false);
  });
  it('missing key untouched', () => {
    expect(isFactoryDefaultGgmlPath(undefined, USER_DATA)).toBe(false);
  });
  it('empty string untouched', () => {
    expect(isFactoryDefaultGgmlPath('', USER_DATA)).toBe(false);
  });
});

describe('sanitizeStoragePathPatch:CJK 兜底(design D6-2)', () => {
  it('cjk path keys dropped, non-path keys untouched', () => {
    expect(
      sanitizeStoragePathPatch({
        storageRoot: 'D:\\模型',
        funasrModelsPath: 'D:\\语音',
        customTempDir: '/tmp/ok',
        language: '中文可以出现在非路径键',
      }),
    ).toEqual({
      sanitized: {
        customTempDir: '/tmp/ok',
        language: '中文可以出现在非路径键',
      },
      rejectedKeys: ['storageRoot', 'funasrModelsPath'],
    });
  });
  it('ascii path keys pass through', () => {
    expect(sanitizeStoragePathPatch({ storageRoot: 'D:\\SmartSub' })).toEqual({
      sanitized: { storageRoot: 'D:\\SmartSub' },
      rejectedKeys: [],
    });
  });
  it('undefined patch tolerated', () => {
    expect(sanitizeStoragePathPatch(undefined)).toEqual({
      sanitized: {},
      rejectedKeys: [],
    });
  });
});

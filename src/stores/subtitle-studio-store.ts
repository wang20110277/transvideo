// 字幕板块视图态 store:向导开合/步骤/文件/选项 + 任务列表与日志。
// submit() 的 payload 逐字段对齐移植树 TaskSubmission(electron/services/smartsub):
// - files: IFiles(types/types.ts;字段构造对齐 helpers/fileUtils.ts wrapFileObject)
// - formData: IFormData(types/types.ts;默认值对齐 helpers/utils.ts defaultUserConfig)
// renderer 只经 import type 消费移植树类型(值导入被 lint 禁止)。
import { create } from 'zustand';
import { smartsubIpc } from '@/lib/smartsub-ipc';
import { SUBTITLE_ENGINES } from '@/stores/subtitle-feature-flags';
import type { TaskSubmission } from '@/types/smartsub';
import type { IFiles } from '@smartsub/types/types';
import type { SubtitleAlignment, SubtitleStyle } from '@smartsub/types/subtitleMerge';
import type { TranscriptionEngine } from '@smartsub/types/engine';
import type { SubtitleEngineId } from '@/stores/subtitle-feature-flags';

/** 向导文件(渲染侧视图对象;uuid 由 UI 用 crypto.randomUUID() 生成) */
export interface WizardFile {
  uuid: string;
  name: string; // 完整文件名(含扩展名,file picker 的 file.name)
  path: string; // 绝对路径
  size?: number;
}

/** 烧录样式:v1 只开放字体/字号/位置三档,其余走树内默认样式 */
export interface WizardBurnStyle {
  fontName: string; // '' = 跟随宿主平台默认字体(树内 platformDefaultFont)
  fontSize: number; // 10-72
  position: SubtitleAlignment; // numpad 九宫格,2=底部居中
}

export interface WizardOptions {
  transcriptionEngine: SubtitleEngineId; // 默认 'builtin'
  /** cloud 引擎必填:云 ASR 服务商实例 id(getAsrProviders 返回项的 id) */
  asrProviderId?: string;
  sourceLanguage: string; // 默认 'auto'
  targetLanguage: string; // 默认 'zh'
  translateOn: boolean; // 默认 true → taskType 'generateAndTranslate'
  translationProvider: string; // 默认 'bingFree'
  bilingual: boolean; // 双语字幕,默认 true → translateContent 'sourceAndTranslate'
  burn: boolean; // 默认 false(树内 compose 缺省不合成)
  burnStyle: WizardBurnStyle;
}

const DEFAULT_WIZARD_OPTIONS: WizardOptions = {
  transcriptionEngine: 'builtin',
  sourceLanguage: 'auto',
  targetLanguage: 'zh',
  translateOn: true,
  translationProvider: 'bingFree',
  bilingual: true,
  burn: false,
  burnStyle: { fontName: '', fontSize: 24, position: 2 },
};

/** name(含扩展名)→ 树内 fileName(去扩展名)/fileExtension(含点,小写);无扩展名时 fileExtension 为 '' */
function splitFileName(name: string): { fileName: string; fileExtension: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { fileName: name, fileExtension: '' };
  return {
    fileName: name.slice(0, dot),
    fileExtension: name.slice(dot).toLowerCase(),
  };
}

/** 绝对路径 → 树内 directory(文件所在目录;渲染侧无 node:path,按分隔符手切) */
function directoryOf(filePath: string): string {
  const sep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return sep === -1 ? '' : filePath.slice(0, sep);
}

/** WizardFile → IFiles(对齐 helpers/fileUtils.ts wrapFileObject 的字段构造;
 * fileSize 仅为渲染层展示字段,不在 IFiles 上,不下发) */
function toTaskFile(file: WizardFile): IFiles {
  const { fileName, fileExtension } = splitFileName(file.name);
  return {
    uuid: file.uuid,
    filePath: file.path,
    fileName,
    fileExtension,
    directory: directoryOf(file.path),
  };
}

/** WizardOptions → formData(默认值对齐 helpers/utils.ts defaultUserConfig) */
function toTaskFormData(o: WizardOptions): TaskSubmission['formData'] {
  const engine: TranscriptionEngine = SUBTITLE_ENGINES.includes(o.transcriptionEngine)
    ? o.transcriptionEngine
    : 'builtin';
  // 部分样式即可:主进程 resolveComposeConfig.resolveComposeRunOptions 会
  // 浅合并树内 DEFAULT_PIPELINE_STYLE + 平台默认字体,缺失字段全部有兜底
  const burnStylePatch: Partial<SubtitleStyle> = {
    fontSize: o.burnStyle.fontSize,
    alignment: o.burnStyle.position,
    ...(o.burnStyle.fontName ? { fontName: o.burnStyle.fontName } : {}),
  };
  const compose =
    o.burn
      ? { subtitle: 'hard' as const, style: burnStylePatch as SubtitleStyle } // v1 仅硬烧录
      : undefined;
  return {
    // 转写+翻译 / 仅转写(fileProcessor 以 taskType 判定 shouldTranslateSubtitle)
    taskType: o.translateOn ? 'generateAndTranslate' : 'generateOnly',
    transcriptionEngine: engine,
    ...(engine === 'cloud' && o.asrProviderId
      ? { asrProviderId: o.asrProviderId }
      : {}),
    model: 'tiny', // builtin 默认模型;cloud 时由实例内模型接管
    useEmbeddedSubtitles: true,
    sourceLanguage: o.sourceLanguage,
    targetLanguage: o.targetLanguage,
    translateProvider: o.translationProvider,
    // 双语 = 源文+译文;仅译文 = onlyTranslate(树内 subtitleOutput.ts 语义)
    translateContent: o.bilingual ? 'sourceAndTranslate' : 'onlyTranslate',
    translateRetryTimes: '3',
    sourceSrtSaveOption: 'noSave',
    targetSrtSaveOption: 'fileNameWithLang',
    customTargetSrtFileName: '${fileName}.${targetLanguage}',
    customSourceSrtFileName: '${fileName}.${sourceLanguage}',
    subtitleOutputFormat: 'srt',
    maxConcurrentTasks: 1,
    ...(compose ? { compose } : {}),
  };
}

interface SubtitleStudioState {
  ready: boolean;
  wizardOpen: boolean;
  wizardStep: 0 | 1 | 2;
  wizardFiles: WizardFile[];
  wizardOptions: WizardOptions;
  tasks: unknown[];
  logLines: string[];
  init: () => Promise<void>;
  openWizard: (presetFiles?: WizardFile[]) => void;
  closeWizard: () => void;
  setStep: (step: 0 | 1 | 2) => void;
  addFiles: (files: WizardFile[]) => void;
  removeFile: (uuid: string) => void;
  setOptions: (patch: Partial<WizardOptions>) => void;
  submit: () => Promise<void>;
  refreshTasks: () => Promise<void>;
  attachEvents: () => () => void;
  detachEvents: () => void;
}

/** 当前 message 订阅的卸载函数(attachEvents/detachEvents 共管,重复 attach 先卸旧) */
let offMessages: (() => void) | null = null;

export const useSubtitleStudioStore = create<SubtitleStudioState>((set, get) => ({
  ready: false,
  wizardOpen: false,
  wizardStep: 0,
  wizardFiles: [],
  wizardOptions: { ...DEFAULT_WIZARD_OPTIONS },
  tasks: [],
  logLines: [],
  init: async () => {
    const r = await smartsubIpc.init();
    set({ ready: r.ok === true });
    await get().refreshTasks();
  },
  openWizard: (presetFiles) =>
    set({ wizardOpen: true, wizardStep: 0, wizardFiles: presetFiles ?? [] }),
  closeWizard: () => set({ wizardOpen: false }),
  setStep: (wizardStep) => set({ wizardStep }),
  addFiles: (files) =>
    set((s) => ({ wizardFiles: [...s.wizardFiles, ...files] })),
  removeFile: (uuid) =>
    set((s) => ({ wizardFiles: s.wizardFiles.filter((f) => f.uuid !== uuid) })),
  setOptions: (patch) =>
    set((s) => ({ wizardOptions: { ...s.wizardOptions, ...patch } })),
  submit: async () => {
    const { wizardFiles: files, wizardOptions: o } = get();
    const payload: TaskSubmission = {
      // 树内 TaskSubmission 必填:projectId/requestId 向导不收集,按语义补默认
      // (projectId=每批一个新工程,与树内 enqueueProjectFiles 的 randomUUID 同源语义)
      requestId: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
      files: files.map(toTaskFile),
      formData: toTaskFormData(o),
    };
    const result = await smartsubIpc.submitTask(payload);
    if (result && typeof result === 'object' && 'success' in result && !result.success) {
      set((s) => ({
        logLines: [...s.logLines.slice(-200), `submitTask failed: ${result.error}`],
      }));
      return;
    }
    set({ wizardOpen: false });
    await get().refreshTasks();
  },
  refreshTasks: async () =>
    set({ tasks: (await smartsubIpc.getTaskProjects()) ?? [] }),
  attachEvents: () => {
    get().detachEvents();
    const off = smartsubIpc.onMessage((message) =>
      set((s) => ({ logLines: [...s.logLines.slice(-200), message] })));
    offMessages = off;
    return off;
  },
  detachEvents: () => {
    offMessages?.();
    offMessages = null;
  },
}));

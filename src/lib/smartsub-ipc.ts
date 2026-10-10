// 字幕板块唯一 IPC 出口(UI 禁止直接 window.ipcRenderer 调 smartsub 通道)
// 宿主 preload(electron/preload.ts)已暴露 invoke/send/on/off,
// window.ipcRenderer 在宿主类型中为可选(electron.d.ts),渲染进程实际必有 preload 注入
const ipc = () => window.ipcRenderer!;

export const smartsubIpc = {
  init: () => ipc().invoke('smartsub:init') as Promise<{ ok: true } | { ok: false; error: string }>,
  getSettings: () => ipc().invoke('getSettings'),
  setSettings: (s: unknown) => ipc().invoke('setSettings', s),
  getUserConfig: () => ipc().invoke('getUserConfig'),
  setUserConfig: (c: unknown) => ipc().send('setUserConfig', c),
  getTranslationProviders: () => ipc().invoke('getTranslationProviders'),
  getAsrProviders: () => ipc().invoke('getAsrProviders'),
  getTtsProviders: () => ipc().invoke('getTtsProviders'),
  /**
   * 保存翻译/云 ASR 服务商列表。CHANNELS.md 标 send(legacy ipcMain.on 形态,
   * 收裸数组);树内同时注册了 invoke 形态(ipcStoreHandlers 的 saveProviderList
   * 循环)——此处走 invoke:带确认回执,且请求体为 CAS 语义
   * {providers, expectedProviders}(expectedProviders=读取时快照,他窗并发
   * 改动会以 PROVIDER_SETTINGS_CONFLICT 拒绝而非静默覆盖)。
   */
  setTranslationProviders: (payload: unknown) => ipc().invoke('setTranslationProviders', payload),
  setAsrProviders: (payload: unknown) => ipc().invoke('setAsrProviders', payload),
  /** 服务商健康缓存(近 5min 内 testTranslation/testAsrProvider/testTtsProvider 的结果) */
  getProviderHealth: () => ipc().invoke('getProviderHealth'),
  /** 翻译服务商连通性实测:发送 {provider, sourceLanguage, targetLanguage},返回 {translation,...},失败 reject */
  testTranslation: (payload: unknown) => ipc().invoke('testTranslation', payload),
  /** 云 ASR 实例连通性自测:返回 {ok, status?, needsConfig?, detail?} */
  testAsrProvider: (provider: unknown) => ipc().invoke('testAsrProvider', provider),
  getTaskProjects: () => ipc().invoke('getTaskProjects'),
  getTaskProject: (id: string) => ipc().invoke('getTaskProject', id),
  deleteTaskProject: (id: string) => ipc().invoke('deleteTaskProject', id),
  getEngineStatus: () => ipc().invoke('get-engine-status'),
  /** sherpa-onnx 原生库状态:返回 {installed, version?, platform?}(installed=false 即未随构建内置) */
  getSherpaLibStatus: () => ipc().invoke('sherpa-lib-status'),
  /**
   * 系统/模型信息(getSystemInfo):返回 {modelsInstalled:[], modelsPath,
   * downloadingModels:[], pythonEngineStatus, engineRuntimes, ...}(whisper.cpp
   * ggml 模型目录与已装清单的唯一查询口)。
   */
  getSystemInfo: () => ipc().invoke('getSystemInfo'),
  /** 下载 whisper.cpp ggml 模型:发送 {model, source?, needsCoreML?};同一时刻仅允许一个下载(主进程互斥),返回 {success, error?} */
  downloadModel: (payload: { model: string; source?: string; needsCoreML?: boolean }) =>
    ipc().invoke('downloadModel', payload),
  /** 删除 ggml 模型(传模型名,如 'tiny'),返回 true */
  deleteModel: (model: string) => ipc().invoke('deleteModel', model),
  /** 取消进行中的模型下载(各模型下载器统一取消口),返回 true */
  cancelModelDownload: () => ipc().invoke('cancelModelDownload'),
  /** 在文件管理器中打开 whisper.cpp 模型目录 */
  openModelsFolder: () => ipc().invoke('openModelsFolder'),
  /** 从本地文件导入模型:无参调用时主进程弹系统文件选择框(.bin/.mlmodelc),拷入模型目录 */
  importModel: () => ipc().invoke('importModel'),
  submitTask: (payload: unknown) => ipc().invoke('submitTask', payload),
  revealPath: (p: string) => ipc().invoke('smartsub:reveal-path', p),
  /** 烧录字体清单(树内 subtitleMerge:* 系通道,返回 {success, data:[{name, available, ...}]}) */
  listFonts: () => ipc().invoke('subtitleMerge:listFonts'),
  /** SmartSub 统一日志/进度推送通道(messageHandler.sendMessage) */
  onMessage: (cb: (message: string) => void) => {
    const listener = (_e: unknown, message: string) => cb(message);
    ipc().on('message', listener);
    return () => ipc().off?.('message', listener);
  },
  /** 模型下载百分比推送:payload 为 (model, 0..0.99)(完成时主进程直接 resolve invoke,不发 1.0) */
  onModelDownloadProgress: (cb: (model: string, progress: number) => void) => {
    const listener = (_e: unknown, model: string, progress: number) => cb(model, progress);
    ipc().on('downloadProgress', listener);
    return () => ipc().off?.('downloadProgress', listener);
  },
  /**
   * 模型下载明细推送:payload 为 (model, {status:'idle'|'downloading'|'extracting'|
   * 'completed'|'error', progress, downloaded, total, speed, eta, error?})。
   */
  onModelDownloadDetail: (
    cb: (
      model: string,
      detail: {
        status: 'idle' | 'downloading' | 'extracting' | 'completed' | 'error';
        progress: number;
        downloaded: number;
        total: number;
        speed: number;
        eta: number;
        error?: string;
      },
    ) => void,
  ) => {
    const listener = (_e: unknown, model: string, detail: Parameters<typeof cb>[1]) =>
      cb(model, detail);
    ipc().on('modelDownloadDetail', listener);
    return () => ipc().off?.('modelDownloadDetail', listener);
  },
};

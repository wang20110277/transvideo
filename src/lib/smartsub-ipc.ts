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
  getTaskProjects: () => ipc().invoke('getTaskProjects'),
  getTaskProject: (id: string) => ipc().invoke('getTaskProject', id),
  deleteTaskProject: (id: string) => ipc().invoke('deleteTaskProject', id),
  getEngineStatus: () => ipc().invoke('get-engine-status'),
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
};

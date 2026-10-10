// SmartSub 移植树装配桥(唯一允许新写的宿主对接层)
// 依据: SmartSub main/background.ts 的启动序列,过滤掉排除模块
// 注: uvThreadPool 必须是本文件首个 import——libuv 线程池在首个异步池任务
// 提交时定型,之后修改无效(源注释要求)。
import '../helpers/uvThreadPool';
import { BrowserWindow, dialog, ipcMain } from 'electron';
import { setupIpcHandlers } from '../helpers/ipcHandlers';
import { setupTaskProcessor } from '../helpers/taskProcessor';
import { setupSystemInfoManager } from '../helpers/systemInfoManager';
import { setupStoreHandlers } from '../helpers/storeManager';
import { setupTaskManager } from '../helpers/taskManager';
import {
  flushWorkItemStore,
  getWorkItems,
  initializeWorkItemStore,
} from '../helpers/workItemStore';
import { setupWorkItemHandlers } from '../helpers/workItemHandlers';
import { setupRecipeHandlers } from '../helpers/ipcRecipeHandlers';
import { setupGlossaryHandlers } from '../helpers/ipcGlossaryHandlers';
import { setupParameterHandlers } from '../helpers/ipcParameterHandlers';
import { setupSubtitleMergeHandlers } from '../helpers/ipcSubtitleMergeHandlers';
import { setupPipelineHandlers } from '../helpers/ipcPipelineHandlers';
import { setupNetworkHandlers } from '../helpers/ipcNetworkHandlers';
import { registerAddonIpcHandlers } from '../helpers/ipcAddonHandlers';
import { registerEngineIpcHandlers } from '../helpers/ipcEngineHandlers';
import { setupDubbingHandlers } from '../helpers/ipcDubbingHandlers';
import { setupVoiceCloneHandlers } from '../helpers/ipcVoiceCloneHandlers';
import { shutdownPythonRuntime } from '../helpers/pythonRuntime';
import { applyProxyFromSettings } from '../helpers/network/proxyManager';

let initialized = false;
let initPromise: Promise<void> | null = null;

async function doInit(mainWindow: BrowserWindow): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    initializeWorkItemStore();
    setupStoreHandlers();
    setupSystemInfoManager(mainWindow);
    setupTaskManager();
    setupTaskProcessor(mainWindow);
    setupWorkItemHandlers();
    setupRecipeHandlers();
    setupGlossaryHandlers(mainWindow);
    setupParameterHandlers();
    setupSubtitleMergeHandlers(mainWindow);
    setupPipelineHandlers(mainWindow);
    setupNetworkHandlers();
    registerAddonIpcHandlers();
    registerEngineIpcHandlers();
    setupDubbingHandlers(mainWindow);   // P0 就位(代码已搬),UI P2 才开
    setupVoiceCloneHandlers(mainWindow); // 同上
    setupIpcHandlers(mainWindow);       // 兜底杂项,放最后(与 background.ts 顺序一致)
    await applyProxyFromSettings();
    initialized = true;
  })();
  return initPromise;
}

export function initSmartSubBridge(): void {
  ipcMain.handle('smartsub:init', async (event) => {
    try {
      // 宿主适配:树内 8 个 setup* 需要 mainWindow(SmartSub 自有窗口的等价物),
      // 这里取发起 smartsub:init 的渲染窗口——它就是 SmartSub UI 的宿主窗口。
      const mainWindow = BrowserWindow.fromWebContents(event.sender);
      if (!mainWindow) {
        return { ok: false as const, error: 'smartsub:init: no sender window' };
      }
      await doInit(mainWindow);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: String(error) };
    }
  });
  ipcMain.handle('smartsub:reveal-path', async (_e, p: string) => {
    const { shell } = await import('electron');
    shell.showItemInFolder(p);
    return { ok: true as const };
  });
}

/** 退出守卫:刷盘 + 关 python 运行时;有运行中任务先确认 */
export async function smartsubQuitGuard(): Promise<boolean> {
  if (!initialized) return true;
  let running = false;
  try {
    // WorkItemStatus: 'waiting' | 'running' | 'done' | 'error' | 'interrupted' | 'review'
    // (源树无 getTaskProjects 导出;以 workItemStore.getWorkItems() 的实际结构判定,
    //  waiting=排队中、running=执行中,均属"退出会中断"的态)
    running = getWorkItems().some(
      (item) => item.status === 'running' || item.status === 'waiting',
    );
  } catch { /* 状态不可得时按无任务处理 */ }
  if (running) {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['退出', '取消'],
      defaultId: 1,
      message: '有字幕任务正在运行,退出将中断(可恢复)',
    });
    if (response === 1) return false;
  }
  // 清理是尽力而为:失败只记日志、仍放行退出——
  // 比丢一次 flush / 残留一个 python 进程更糟的是应用永远退不掉
  try {
    flushWorkItemStore();
  } catch (error) {
    console.error('[smartsub-bridge] flushWorkItemStore on quit failed:', error);
  }
  try {
    await shutdownPythonRuntime();
  } catch (error) {
    console.error('[smartsub-bridge] shutdownPythonRuntime on quit failed:', error);
  }
  return true;
}

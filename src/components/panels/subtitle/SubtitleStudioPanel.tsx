// 字幕板块壳:「字幕」Tab 挂载点(Layout fullScreenTabs)——头部(标题/新建入口)
// + 任务列表/详情双栏 + 任务向导(TaskWizard)。
// init()/refreshTasks() 的 Promise 会 reject 且 store 内无 catch——组件侧自兜底
// 写 console.error,防 unhandled rejection 崩渲染;init 返回失败(ready=false)时
// 头部显示一行错误与「重试」按钮(Task 10 移交点:store 只落 ready 布尔,失败态
// 由壳层本地跟踪,重试即再调 init())。
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubtitleStudioStore } from "@/stores/subtitle-studio-store";
import { TaskList } from "./TaskList";
import { TaskDetail } from "./TaskDetail";
import { TaskWizard } from "./TaskWizard/TaskWizard";

export function SubtitleStudioPanel() {
  // selector 订阅:避免整 store 解构——logLines 每条消息都会 push,会高频重渲染壳层
  const init = useSubtitleStudioStore((s) => s.init);
  const attachEvents = useSubtitleStudioStore((s) => s.attachEvents);
  const openWizard = useSubtitleStudioStore((s) => s.openWizard);
  const ready = useSubtitleStudioStore((s) => s.ready);
  // 选中任务是板块内 UI 态(store 无此字段且本任务禁改 store):提升到壳层传递
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // init 已返回但 ready 仍为 false → 初始化失败(区别于尚未完成的 init)
  const [initFailed, setInitFailed] = useState(false);

  const runInit = useCallback(() => {
    setInitFailed(false);
    init()
      .then(() => {
        if (!useSubtitleStudioStore.getState().ready) setInitFailed(true);
      })
      .catch((error) => {
        console.error("[subtitle-studio] init failed:", error);
        setInitFailed(true);
      });
  }, [init]);

  useEffect(() => {
    runInit();
    // attachEvents 幂等(重复 attach 先卸旧订阅),返回的清理函数即 effect 卸载钩子
    return attachEvents();
  }, [runInit, attachEvents]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">字幕配音</h1>
          <p className="text-xs text-muted-foreground">视频转写、翻译与字幕烧录</p>
        </div>
        <Button onClick={() => openWizard()} disabled={!ready}>
          新建任务
        </Button>
      </header>
      {!ready && initFailed && (
        <div
          className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive"
          data-subtitle-init-error
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            字幕引擎初始化失败,任务功能不可用(详见控制台日志)
          </span>
          <Button variant="outline" size="sm" className="h-6 shrink-0 px-2 text-xs" onClick={runInit}>
            <RotateCw className="h-3 w-3" />
            重试
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="w-80 shrink-0 border-r border-border">
          <TaskList selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <div className="min-w-0 flex-1">
          <TaskDetail taskId={selectedId} />
        </div>
      </div>
      <TaskWizard />
    </div>
  );
}

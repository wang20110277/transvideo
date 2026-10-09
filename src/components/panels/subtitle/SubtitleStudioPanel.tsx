// 字幕板块壳:「字幕」Tab 挂载点(Layout fullScreenTabs)——头部(标题/新建入口)
// + 任务列表/详情双栏。向导 UI 由 Task 11 接入(openWizard 此处只开 store 状态)。
// init()/refreshTasks() 的 Promise 会 reject 且 store 内无 catch——组件侧自兜底
// 写 console.error,防 unhandled rejection 崩渲染。
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSubtitleStudioStore } from "@/stores/subtitle-studio-store";
import { TaskList } from "./TaskList";
import { TaskDetail } from "./TaskDetail";

export function SubtitleStudioPanel() {
  // selector 订阅:避免整 store 解构——logLines 每条消息都会 push,会高频重渲染壳层
  const init = useSubtitleStudioStore((s) => s.init);
  const attachEvents = useSubtitleStudioStore((s) => s.attachEvents);
  const openWizard = useSubtitleStudioStore((s) => s.openWizard);
  const ready = useSubtitleStudioStore((s) => s.ready);
  // 选中任务是板块内 UI 态(store 无此字段且本任务禁改 store):提升到壳层传递
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    init().catch((error) => console.error("[subtitle-studio] init failed:", error));
    // attachEvents 幂等(重复 attach 先卸旧订阅),返回的清理函数即 effect 卸载钩子
    return attachEvents();
  }, [init, attachEvents]);

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
      <div className="flex min-h-0 flex-1">
        <div className="w-80 shrink-0 border-r border-border">
          <TaskList selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <div className="min-w-0 flex-1">
          <TaskDetail taskId={selectedId} />
        </div>
      </div>
    </div>
  );
}

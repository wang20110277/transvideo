// 字幕任务列表:渲染 getTaskProjects 实际返回的 TaskProject(id/name/taskType/
// files/createdAt/updatedAt;按 updatedAt 倒序)+ 5s 轮询兜底刷新。
// 阶段字段在树内类型层标 boolean,但运行期是 ''|'loading'|'done'|'error' 字符串
// 状态机(对齐主进程 workItemMigration.derivePipelineWorkItemStatus 的判定),
// 故经 Record<string, unknown> 防御式读取——tasks 为空数组/字段缺失均不崩。
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSubtitleStudioStore } from "@/stores/subtitle-studio-store";
import type { TaskProject } from "@smartsub/types/types";

const STAGE_LABELS: Record<string, string> = {
  extractAudio: "提取音频",
  extractSubtitle: "识别字幕",
  refineSubtitle: "精修字幕",
  manuscriptMatch: "文稿匹配",
  translateSubtitle: "翻译字幕",
  prepareSubtitle: "准备字幕",
  speakerDiarization: "角色分离",
  exportSubtitle: "导出字幕",
  dubbing: "配音",
  composeVideo: "合成视频",
};

const TASK_TYPE_LABELS: Record<string, string> = {
  generateAndTranslate: "转写+翻译",
  generateOnly: "仅转写",
  translateOnly: "仅翻译",
};

type StatusKind = "running" | "interrupted" | "error" | "review" | "done" | "waiting";

const STATUS_BADGE: Record<
  StatusKind,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  running: { label: "进行中", variant: "default" },
  interrupted: { label: "已中断", variant: "destructive" },
  error: { label: "出错", variant: "destructive" },
  review: { label: "待校对", variant: "outline" },
  done: { label: "已完成", variant: "secondary" },
  waiting: { label: "等待中", variant: "outline" },
};

/** 运行期阶段值为字符串(''|loading|done|error);类型层标 boolean,绕过类型直读 */
function stageString(file: Record<string, unknown>, key: string): string {
  const value = file[key];
  return typeof value === "string" ? value : "";
}

function isTaskProject(value: unknown): value is TaskProject {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { id?: unknown; files?: unknown };
  return typeof v.id === "string" && Array.isArray(v.files);
}

/** 状态推导:优先级对齐主进程 derivePipelineWorkItemStatus(loading > 中断 > 错误 > 校对 > 完成 > 等待) */
function deriveStatus(files: TaskProject["files"]): { kind: StatusKind; detail: string } {
  let anyLoading = false;
  let anyError = false;
  let anyInterrupted = false;
  let anyReview = false;
  let hasAnyStage = false;
  let allStagesDone = true;
  let loadingDetail = "";
  let errorDetail = "";

  for (const file of files ?? []) {
    if (typeof file !== "object" || file === null) continue;
    const row = file as unknown as Record<string, unknown>;
    if (stageString(row, "subtitleGate") === "review" || stageString(row, "dubbingGate") === "review") {
      anyReview = true;
    }
    for (const key of Object.keys(STAGE_LABELS)) {
      const state = stageString(row, key);
      if (!state) continue;
      hasAnyStage = true;
      if (state === "loading") {
        anyLoading = true;
        const progress = row[`${key}Progress`];
        // 树内进度为 0-100 数值(fileProcessor 夹在 0..99,完成置 100)
        const percent =
          typeof progress === "number" && Number.isFinite(progress)
            ? `${Math.min(100, Math.max(0, Math.round(progress)))}%`
            : "";
        loadingDetail = `${STAGE_LABELS[key]} ${percent}`.trim();
      }
      if (state === "error") {
        anyError = true;
        anyInterrupted = anyInterrupted || row[`${key}Error`] === "TASK_INTERRUPTED";
        errorDetail = STAGE_LABELS[key];
      }
      if (state !== "done") allStagesDone = false;
    }
  }

  if (anyLoading) return { kind: "running", detail: loadingDetail };
  if (anyInterrupted) return { kind: "interrupted", detail: errorDetail };
  if (anyError) return { kind: "error", detail: errorDetail };
  if (anyReview) return { kind: "review", detail: "人工检查点" };
  if (hasAnyStage && allStagesDone) return { kind: "done", detail: "" };
  return { kind: "waiting", detail: "" };
}

function formatTime(ts: unknown): string {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return "";
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export function TaskList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const tasks = useSubtitleStudioStore((s) => s.tasks);
  const refreshTasks = useSubtitleStudioStore((s) => s.refreshTasks);

  // 5s 轮询兜底(事件驱动之外的保底);store 的 refreshTasks 会 reject 且内部
  // 无 catch,此处兜底防 unhandled rejection
  useEffect(() => {
    const timer = window.setInterval(() => {
      refreshTasks().catch((error) =>
        console.error("[subtitle-studio] refreshTasks failed:", error),
      );
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refreshTasks]);

  const list = (tasks ?? []).filter(isTaskProject);

  if (list.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center">
        <p className="text-sm text-muted-foreground">还没有任务</p>
        <p className="text-xs text-muted-foreground">点击右上角「新建任务」开始</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1 p-2">
        {list.map((task) => {
          const status = deriveStatus(task.files);
          const badge = STATUS_BADGE[status.kind];
          return (
            <button
              key={task.id}
              onClick={() => onSelect(task.id)}
              className={cn(
                "rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:bg-muted/50",
                selectedId === task.id && "border-border bg-muted",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium" title={task.name}>
                  {task.name || "未命名任务"}
                </span>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">{TASK_TYPE_LABELS[task.taskType] ?? task.taskType}</span>
                <span className="shrink-0">{status.detail || formatTime(task.updatedAt)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}

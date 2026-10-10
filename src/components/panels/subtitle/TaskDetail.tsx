// 字幕任务详情:选中任务的「文件 × 产出物」卡片。
// 产出物路径取自 getTaskProjects → TaskProject.files(IFiles)的实际字段
// (sourceSubtitleFiles/translatedSubtitleFiles/srtFile/translatedSrtFile/
//  dubbedAudioPath/dubbedTrackPath/finalVideoPath),防御式读取,缺失不渲染。
// 「到素材面板查看」:useMediaPanelStore.requestRevealMedia(mediaId) 的入参语义是
// 素材库媒体 ID,且其 highlightMediaId 在素材视图无消费者;smartsub 产物并非
// 素材库条目——按 brief 约定隐藏该按钮、不造接口(素材联动留给后续任务)。
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderOpen } from "lucide-react";
import { smartsubIpc } from "@/lib/smartsub-ipc";
import { useSubtitleStudioStore } from "@/stores/subtitle-studio-store";
import type { TaskProject } from "@smartsub/types/types";

// 与 TaskList.tsx 的 STAGE_LABELS 同源(树内阶段键),v1 壳层各持一份避免向
// 组件文件导出非组件值(react-refresh/only-export-components)
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

/** 运行期阶段值为字符串状态机;类型层标 boolean,绕过类型直读(同 TaskList) */
function stageString(file: Record<string, unknown>, key: string): string {
  const value = file[key];
  return typeof value === "string" ? value : "";
}

function isTaskProject(value: unknown): value is TaskProject {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { id?: unknown; files?: unknown };
  return typeof v.id === "string" && Array.isArray(v.files);
}

function basename(path: string): string {
  const sep = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return sep === -1 ? path : path.slice(sep + 1);
}

function displayName(file: Record<string, unknown>): string {
  const name = typeof file.fileName === "string" ? file.fileName : "";
  const ext = typeof file.fileExtension === "string" ? file.fileExtension : "";
  if (name || ext) return `${name}${ext}`;
  const path = typeof file.filePath === "string" ? file.filePath : "";
  return basename(path) || "未命名文件";
}

/** 单文件阶段概览:失败阶段 / 进行中阶段+百分比 / 完成度 */
function fileStageText(file: Record<string, unknown>): string {
  let entered = 0;
  let done = 0;
  let loadingKey = "";
  let loadingPercent = "";
  let failedKey = "";

  for (const key of Object.keys(STAGE_LABELS)) {
    const state = stageString(file, key);
    if (!state) continue;
    entered += 1;
    if (state === "done") {
      done += 1;
    } else if (state === "loading") {
      loadingKey = key;
      const progress = file[`${key}Progress`];
      loadingPercent =
        typeof progress === "number" && Number.isFinite(progress)
          ? `${Math.min(100, Math.max(0, Math.round(progress)))}%`
          : "";
    } else if (state === "error") {
      failedKey = key;
    }
  }

  if (failedKey) return `失败:${STAGE_LABELS[failedKey]}`;
  if (loadingKey) return `${STAGE_LABELS[loadingKey]} ${loadingPercent}`.trim();
  if (entered > 0 && entered === done) return `全部 ${done} 个阶段完成`;
  if (entered > 0) return `阶段 ${done}/${entered}`;
  return "等待中";
}

interface OutputEntry {
  label: string;
  path: string;
}

/** 收集该文件全部产出物路径并按 path 去重(新旧字段可能同时存在) */
function collectOutputs(file: Record<string, unknown>): OutputEntry[] {
  const out: OutputEntry[] = [];
  const push = (label: string, path: unknown) => {
    if (typeof path === "string" && path) out.push({ label, path });
  };
  const sourceList = file.sourceSubtitleFiles;
  if (Array.isArray(sourceList)) sourceList.forEach((p) => push("源语言字幕", p));
  const translatedList = file.translatedSubtitleFiles;
  if (Array.isArray(translatedList)) translatedList.forEach((p) => push("译文字幕", p));
  push("源语言字幕", file.srtFile); // 旧字段兜底
  push("译文字幕", file.translatedSrtFile); // 旧字段兜底
  push("配音音频", file.dubbedAudioPath);
  push("配音音轨", file.dubbedTrackPath);
  push("成品视频", file.finalVideoPath);

  const seen = new Set<string>();
  return out.filter((entry) => {
    if (seen.has(entry.path)) return false;
    seen.add(entry.path);
    return true;
  });
}

function formatTime(ts: unknown): string {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return "";
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function revealPath(path: string): void {
  // invoke 返回 Promise,reject 时兜底防 unhandled rejection
  smartsubIpc.revealPath(path).catch((error) => {
    console.error("[subtitle-studio] revealPath failed:", error);
  });
}

export function TaskDetail({ taskId }: { taskId: string | null }) {
  const tasks = useSubtitleStudioStore((s) => s.tasks);
  const task = (tasks ?? []).filter(isTaskProject).find((t) => t.id === taskId) ?? null;

  if (!task) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        {taskId ? "任务不存在或已删除" : "在左侧选择一个任务查看详情"}
      </div>
    );
  }

  const files = task.files ?? [];

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-4">
        <header className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold" title={task.name}>
            {task.name || "未命名任务"}
          </h2>
          <Badge variant="outline">{TASK_TYPE_LABELS[task.taskType] ?? task.taskType}</Badge>
          <span className="ml-auto text-xs text-muted-foreground">
            更新于 {formatTime(task.updatedAt) || "—"}
          </span>
        </header>

        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">该任务没有文件</p>
        ) : (
          files.map((file, index) => {
            if (typeof file !== "object" || file === null) return null;
            const row = file as unknown as Record<string, unknown>;
            const outputs = collectOutputs(row);
            const key =
              typeof row.uuid === "string" && row.uuid ? row.uuid : `file-${index}`;
            return (
              <section key={key} className="rounded-lg border border-border bg-panel p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium" title={displayName(row)}>
                    {displayName(row)}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {fileStageText(row)}
                  </span>
                </div>
                {outputs.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">暂无产出物</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {outputs.map((output) => (
                      <li
                        key={output.path}
                        className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {output.label}
                          </span>
                          <span className="truncate text-xs" title={output.path}>
                            {basename(output.path)}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-xs"
                          onClick={() => revealPath(output.path)}
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                          打开所在文件夹
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </div>
    </ScrollArea>
  );
}

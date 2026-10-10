// 设置子页·模型管理:whisper.cpp(ggml)模型目录/下载/删除/进度 + 引擎就绪状态。
// 通道:getSystemInfo(已装清单+目录+进行中下载)/downloadModel/deleteModel/
// cancelModelDownload/openModelsFolder/importModel(模型类),get-engine-status +
// sherpa-lib-status(引擎类);下载百分比经 downloadProgress/modelDownloadDetail
// 推送(webContents.send,wrapper 统一订阅)。sherpa 原生库如实显示未装状态,
// 不提供下载按钮(native 由构建期补,Task 14)。
import { useCallback, useEffect, useRef, useState } from "react";
import { FolderOpen, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { smartsubIpc } from "@/lib/smartsub-ipc";
import {
  MODEL_DOWNLOAD_SOURCES,
  WHISPER_MODEL_CATALOG,
  engineBadge,
  engineStatusOf,
  formatEta,
  formatSpeed,
  loadModelSystemInfo,
  toDownloadSource,
  toSherpaLibStatus,
  type ModelDownloadSourceId,
  type ModelSystemInfo,
} from "./settings-data";

/** 单模型下载进行态(来自 modelDownloadDetail 推送) */
interface DownloadState {
  status: "downloading" | "extracting" | "error";
  /** 0-100 */
  percent: number;
  speed: number;
  eta: number;
}

const STATUS_LABELS: Record<DownloadState["status"], string> = {
  downloading: "下载中",
  extracting: "解压中",
  error: "失败",
};

export function ModelsSettings() {
  const [systemInfo, setSystemInfo] = useState<ModelSystemInfo | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [engineStatuses, setEngineStatuses] = useState<unknown>(null);
  const [sherpa, setSherpa] = useState<{ installed: boolean; version?: string; platform?: string } | null>(null);
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
  /** invoke 尚未返回的下载(返回即结束,成败由此判定);与推送态互补 */
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const [downloadSource, setDownloadSource] = useState<ModelDownloadSourceId>("mirror");
  const sourceRef = useRef(downloadSource);
  sourceRef.current = downloadSource;

  const refresh = useCallback(() => {
    return Promise.all([
      loadModelSystemInfo(),
      smartsubIpc.getEngineStatus(),
      smartsubIpc.getSherpaLibStatus().then(toSherpaLibStatus),
    ])
      .then(([info, statuses, sherpaStatus]) => {
        setSystemInfo(info);
        setEngineStatuses(statuses);
        setSherpa(sherpaStatus);
        setLoadFailed(false);
      })
      .catch((error) => {
        console.error("[subtitle-settings] load model info failed:", error);
        setLoadFailed(true);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 下载推送:downloadProgress(百分比)与 modelDownloadDetail(状态/速度/ETA)双流,
  // detail 流在结束时也会推 completed——到达即清该模型进行态(invoke 返回随后到)
  useEffect(() => {
    const offProgress = smartsubIpc.onModelDownloadProgress((model, progress) => {
      setDownloads((prev) => {
        const current = prev[model] ?? { status: "downloading", percent: 0, speed: 0, eta: 0 };
        if (current.status === "error") return prev;
        return {
          ...prev,
          [model]: {
            ...current,
            percent: Math.min(100, Math.max(0, Math.round(progress * 100))),
          },
        };
      });
    });
    const offDetail = smartsubIpc.onModelDownloadDetail((model, detail) => {
      if (detail.status === "completed" || detail.status === "idle") {
        setDownloads((prev) => {
          if (!prev[model]) return prev;
          const next = { ...prev };
          delete next[model];
          return next;
        });
        return;
      }
      if (detail.status === "error") {
        setDownloads((prev) => ({
          ...prev,
          [model]: { status: "error", percent: 0, speed: 0, eta: 0 },
        }));
        return;
      }
      setDownloads((prev) => ({
        ...prev,
        [model]: {
          status: detail.status === "extracting" ? "extracting" : "downloading",
          percent: Math.min(100, Math.max(0, Math.round(detail.progress))),
          speed: detail.speed,
          eta: detail.eta,
        },
      }));
    });
    return () => {
      offProgress();
      offDetail();
    };
  }, []);

  const installed = new Set(systemInfo?.modelsInstalled ?? []);
  const downloading = new Set([
    ...(systemInfo?.downloadingModels ?? []),
    ...Object.keys(downloads),
  ]);
  // 已安装但不在静态目录里的模型(手工导入/上游新增)也列出,可删除
  const extraInstalled = (systemInfo?.modelsInstalled ?? []).filter(
    (model) => !WHISPER_MODEL_CATALOG.some((spec) => spec.id === model),
  );
  const busy = pendingModel !== null || downloading.size > 0;

  const handleDownload = (model: string) => {
    if (busy) return;
    setPendingModel(model);
    smartsubIpc
      .downloadModel({ model, source: toDownloadSource(sourceRef.current) })
      .then((result) => {
        if (result && typeof result === "object" && "success" in result && !result.success) {
          toast.error(`模型 ${model} 下载未开始:${String((result as { error?: unknown }).error ?? "未知错误")}`);
        } else {
          toast.success(`模型 ${model} 下载完成`);
        }
      })
      .catch((error) => {
        console.error("[subtitle-settings] downloadModel failed:", error);
        toast.error(`模型 ${model} 下载失败:${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        setPendingModel(null);
        setDownloads((prev) => {
          const next = { ...prev };
          delete next[model];
          return next;
        });
        refresh();
      });
  };

  const handleDelete = (model: string) => {
    smartsubIpc
      .deleteModel(model)
      .then(() => {
        toast.success(`模型 ${model} 已删除`);
        return refresh();
      })
      .catch((error) => {
        console.error("[subtitle-settings] deleteModel failed:", error);
        toast.error(`删除模型 ${model} 失败`);
      });
  };

  const handleCancel = () => {
    smartsubIpc
      .cancelModelDownload()
      .then(() => toast.info("已请求取消下载"))
      .catch((error) => console.error("[subtitle-settings] cancelModelDownload failed:", error));
  };

  const builtinStatus = engineStatusOf(engineStatuses, "builtin");
  const cloudStatus = engineStatusOf(engineStatuses, "cloud");

  const renderRow = (model: string, sizeHint?: string) => {
    const isInstalled = installed.has(model);
    const state = downloads[model];
    const isPending = pendingModel === model;
    return (
      <li
        key={model}
        className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2.5"
        data-model-row={model}
      >
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 truncate font-mono text-sm" title={`ggml-${model}.bin`}>
            {model}
          </span>
          {sizeHint && <span className="shrink-0 text-xs text-muted-foreground">{sizeHint}</span>}
          {state ? (
            <Badge variant="default">{STATUS_LABELS[state.status]}</Badge>
          ) : isInstalled ? (
            <Badge variant="secondary">已安装</Badge>
          ) : (
            <Badge variant="outline">未安装</Badge>
          )}
          <div className="flex shrink-0 items-center gap-2">
            {!isInstalled && !state && !isPending && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={busy}
                onClick={() => handleDownload(model)}
              >
                下载
              </Button>
            )}
            {(state || isPending) && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handleCancel}
                disabled={state?.status === "extracting"}
              >
                取消
              </Button>
            )}
            {isInstalled && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleDelete(model)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </Button>
            )}
          </div>
        </div>
        {(state || isPending) && (
          <div className="flex items-center gap-2" data-model-progress={model}>
            <Progress value={state?.percent ?? 0} className="h-1.5 flex-1" />
            <span className="w-40 shrink-0 text-right text-xs text-muted-foreground">
              {isPending && !state
                ? "准备中…"
                : `${state?.percent ?? 0}%${formatSpeed(state?.speed ?? 0) ? ` · ${formatSpeed(state!.speed)}` : ""}${formatEta(state?.eta ?? 0) ? ` · 剩 ${formatEta(state!.eta)}` : ""}`}
            </span>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-5" data-settings-models>
      {/* 引擎就绪状态 */}
      <section className="flex flex-col gap-3 rounded-lg border border-border p-4" data-engine-status-card>
        <h3 className="text-sm font-semibold">引擎状态</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2" data-engine-builtin>
            <div className="flex min-w-0 flex-col">
              <span className="text-sm">内置引擎(whisper.cpp)</span>
              <span className="truncate text-xs text-muted-foreground">
                {builtinStatus.message || "本地转写,随应用内置"}
              </span>
            </div>
            <Badge variant={engineBadge(builtinStatus.state).variant}>
              {engineBadge(builtinStatus.state).label}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2" data-engine-cloud>
            <div className="flex min-w-0 flex-col">
              <span className="text-sm">云端听写</span>
              <span className="truncate text-xs text-muted-foreground">
                {cloudStatus.message || "需在「服务商配置」添加云 ASR 实例"}
              </span>
            </div>
            <Badge variant={engineBadge(cloudStatus.state).variant}>
              {engineBadge(cloudStatus.state).label}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2" data-engine-sherpa>
            <div className="flex min-w-0 flex-col">
              <span className="text-sm">sherpa-onnx 原生库</span>
              <span className="truncate text-xs text-muted-foreground">
                {sherpa === null
                  ? "读取中…"
                  : sherpa.installed
                    ? `${sherpa.version ?? "已安装"}${sherpa.platform ? ` · ${sherpa.platform}` : ""}`
                    : "未安装(随应用构建内置,当前环境缺失;无需手动下载)"}
              </span>
            </div>
            <Badge variant={sherpa?.installed ? "secondary" : "outline"}>
              {sherpa === null ? "检测中" : sherpa.installed ? "已内置" : "未安装"}
            </Badge>
          </div>
        </div>
      </section>

      {/* 模型目录 */}
      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold">模型目录</h3>
        {loadFailed && (
          <p className="text-xs text-destructive">模型信息读取失败,请重试或查看控制台日志</p>
        )}
        <div className="flex items-center gap-2">
          <Input readOnly value={systemInfo?.modelsPath ?? ""} className="h-8 flex-1 font-mono text-xs" data-models-path />
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 px-2 text-xs"
            disabled={!systemInfo?.modelsPath}
            onClick={() => {
              smartsubIpc.openModelsFolder().catch((error) => {
                console.error("[subtitle-settings] openModelsFolder failed:", error);
                toast.error("打开目录失败");
              });
            }}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            打开目录
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 px-2 text-xs"
            onClick={() => {
              smartsubIpc
                .importModel()
                .then((result) => {
                  if (result && typeof result === "object" && "success" in result && result.success) {
                    toast.success("模型已导入");
                    return refresh();
                  }
                  toast.error("导入未完成(已取消或拷贝失败)");
                })
                .catch((error) => {
                  console.error("[subtitle-settings] importModel failed:", error);
                  toast.error("导入模型失败");
                });
            }}
          >
            导入本地模型
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <Label className="text-xs text-muted-foreground">下载源</Label>
          <Select value={downloadSource} onValueChange={(value) => setDownloadSource(value as ModelDownloadSourceId)}>
            <SelectTrigger className="h-8 w-52 text-xs" data-download-source>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODEL_DOWNLOAD_SOURCES.map((source) => (
                <SelectItem key={source.id} value={source.id}>
                  {source.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">同一时刻仅允许一个下载任务</span>
        </div>
      </section>

      {/* 模型清单 */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">
          Whisper 模型{systemInfo ? `(已安装 ${systemInfo.modelsInstalled.length} 个)` : ""}
        </h3>
        {systemInfo === null && !loadFailed && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在读取模型清单…
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {WHISPER_MODEL_CATALOG.map((spec) => renderRow(spec.id, spec.sizeHint))}
          {extraInstalled.map((model) => renderRow(model))}
        </ul>
      </section>
    </div>
  );
}

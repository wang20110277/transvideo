// 设置子页非组件数据源:whisper.cpp 模型目录、服务商表单字段规格、健康/引擎状态
// 归一化。树内 PROVIDER_TYPES/ASR_PROVIDER_TYPES 是移植树值(renderer 值导入被
// lint 禁止),表单规格在此持镜像子集——只镜像 v1 表单开放的字段,保存时以
// {...原实例, ...表单字段} 合并,未开放字段(fallbackProviderIds/提示词等)原样透传。
import { smartsubIpc } from "@/lib/smartsub-ipc";
import {
  filterProviders,
  SUBTITLE_TRANSLATION_PROVIDERS,
} from "@/stores/subtitle-feature-flags";

// ==================== whisper.cpp 模型目录 ====================

/** 可下载的 ggml 模型(镜像自 whisper.cpp 官方模型表;下载 URL 由主进程按 ggml-<id>.bin 构造) */
export interface WhisperModelSpec {
  id: string;
  sizeHint: string;
}

export const WHISPER_MODEL_CATALOG: WhisperModelSpec[] = [
  { id: "tiny", sizeHint: "约 75 MB" },
  { id: "tiny.en", sizeHint: "约 75 MB" },
  { id: "base", sizeHint: "约 142 MB" },
  { id: "base.en", sizeHint: "约 142 MB" },
  { id: "small", sizeHint: "约 466 MB" },
  { id: "small.en", sizeHint: "约 466 MB" },
  { id: "medium", sizeHint: "约 1.5 GB" },
  { id: "medium.en", sizeHint: "约 1.5 GB" },
  { id: "large-v1", sizeHint: "约 2.9 GB" },
  { id: "large-v2", sizeHint: "约 2.9 GB" },
  { id: "large-v3", sizeHint: "约 2.9 GB" },
  { id: "large-v3-turbo", sizeHint: "约 1.6 GB" },
];

/** 下载源:source 传 'huggingface' 走官方源,其余(含 undefined)走国内镜像(主进程 getHfHost 语义) */
export const MODEL_DOWNLOAD_SOURCES = [
  { id: "mirror", label: "镜像源(默认)" },
  { id: "huggingface", label: "HuggingFace 官方" },
] as const;

export type ModelDownloadSourceId = (typeof MODEL_DOWNLOAD_SOURCES)[number]["id"];

/** source 选择 → downloadModel payload 的 source 字段 */
export function toDownloadSource(id: ModelDownloadSourceId): string | undefined {
  return id === "huggingface" ? "huggingface" : undefined;
}

// ==================== 模型/系统信息归一化 ====================

/** getSystemInfo 返回中设置页消费的字段(其余忽略) */
export interface ModelSystemInfo {
  modelsInstalled: string[];
  modelsPath: string;
  downloadingModels: string[];
}

/** unknown → ModelSystemInfo(缺省空值;getSystemInfo reject 时调用方兜底) */
export function toModelSystemInfo(info: unknown): ModelSystemInfo {
  const obj = (info ?? {}) as {
    modelsInstalled?: unknown;
    modelsPath?: unknown;
    downloadingModels?: unknown;
  };
  const strings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  return {
    modelsInstalled: strings(obj.modelsInstalled),
    modelsPath: typeof obj.modelsPath === "string" ? obj.modelsPath : "",
    downloadingModels: strings(obj.downloadingModels),
  };
}

export async function loadModelSystemInfo(): Promise<ModelSystemInfo> {
  return toModelSystemInfo(await smartsubIpc.getSystemInfo());
}

// ==================== 引擎状态 ====================

/** 树内 EngineStatus(types/engine.ts)运行期形状 */
export interface EngineStatusView {
  state: string;
  version?: string;
  message?: string;
}

/** get-engine-status 返回(Record<引擎id, EngineStatus>)取单个引擎,未知形状回落 not_installed */
export function engineStatusOf(statuses: unknown, engineId: string): EngineStatusView {
  const entry = (statuses as Record<string, unknown> | null | undefined)?.[engineId];
  if (typeof entry !== "object" || entry === null) return { state: "unknown" };
  const { state, version, message } = entry as {
    state?: unknown;
    version?: unknown;
    message?: unknown;
  };
  return {
    state: typeof state === "string" ? state : "unknown",
    version: typeof version === "string" ? version : undefined,
    message: typeof message === "string" ? message : undefined,
  };
}

export const ENGINE_STATE_BADGES: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  ready: { label: "就绪", variant: "secondary" },
  not_installed: { label: "未就绪", variant: "outline" },
  downloading: { label: "下载中", variant: "default" },
  error: { label: "异常", variant: "destructive" },
  checking: { label: "检测中", variant: "outline" },
  unknown: { label: "未知", variant: "outline" },
};

export function engineBadge(state: string) {
  return ENGINE_STATE_BADGES[state] ?? ENGINE_STATE_BADGES.unknown;
}

/** sherpa-lib-status 返回:{installed, version?, platform?} */
export interface SherpaLibStatus {
  installed: boolean;
  version?: string;
  platform?: string;
}

export function toSherpaLibStatus(status: unknown): SherpaLibStatus {
  if (typeof status !== "object" || status === null) return { installed: false };
  const { installed, version, platform } = status as {
    installed?: unknown;
    version?: unknown;
    platform?: unknown;
  };
  return {
    installed: installed === true,
    version: typeof version === "string" ? version : undefined,
    platform: typeof platform === "string" ? platform : undefined,
  };
}

// ==================== 服务商表单字段规格 ====================

export interface ProviderFieldSpec {
  key: string;
  label: string;
  type: "text" | "password" | "number";
  placeholder?: string;
  /** number 字段步进 */
  step?: number;
}

const BATCH_FIELDS: ProviderFieldSpec[] = [
  { key: "batchSize", label: "批量大小", type: "number", step: 1 },
  { key: "batchConcurrency", label: "批量并发", type: "number", step: 1 },
  { key: "requestInterval", label: "请求间隔(秒)", type: "number", step: 0.1 },
];

/**
 * v1 翻译服务商表单开放字段(镜像自树内 PROVIDER_TYPES 对应条目的凭据/端点/批量
 * 参数;提示词等长文本与结构化输出开关不开放,保存时原样透传)。键 = 白名单 id
 * (已对齐树内内置实例大小写,'Gemini');openai 无内置实例,不在表内。
 */
export const TRANSLATION_FIELD_SPECS: Record<string, ProviderFieldSpec[]> = {
  bingFree: [{ key: "windowMaxRequests", label: "窗口请求上限(0=不限)", type: "number", step: 1 }, ...BATCH_FIELDS],
  googleFree: [{ key: "windowMaxRequests", label: "窗口请求上限(0=不限)", type: "number", step: 1 }, ...BATCH_FIELDS],
  deepseek: [
    { key: "apiUrl", label: "Base URL", type: "text", placeholder: "https://api.deepseek.com/v1" },
    { key: "apiKey", label: "API Key", type: "password" },
    { key: "modelName", label: "模型名", type: "text", placeholder: "deepseek-chat" },
    ...BATCH_FIELDS,
  ],
  Gemini: [
    { key: "apiUrl", label: "Base URL", type: "text", placeholder: "https://generativelanguage.googleapis.com/v1beta/openai/" },
    { key: "apiKey", label: "API Key", type: "password" },
    { key: "modelName", label: "模型名", type: "text", placeholder: "gemini-2.0-flash" },
    ...BATCH_FIELDS,
  ],
  qwen: [
    { key: "apiUrl", label: "Base URL", type: "text", placeholder: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
    { key: "apiKey", label: "API Key", type: "password" },
    { key: "modelName", label: "模型名", type: "text", placeholder: "qwen-plus" },
    ...BATCH_FIELDS,
  ],
  ollama: [
    { key: "apiUrl", label: "API URL", type: "text", placeholder: "http://localhost:11434/api/chat" },
    { key: "modelName", label: "模型名", type: "text", placeholder: "qwen2.5:7b" },
    ...BATCH_FIELDS,
  ],
};

// ==================== 服务商实例归一化 ====================

/** 服务商实例(翻译/云 ASR 通用最小形状;其余字段原样保留) */
export type ProviderRecord = Record<string, unknown> & { id: string; name: string; type: string };

/** unknown 项 → ProviderRecord;缺 id/name/type 的项丢弃(主进程 assertProviderList 同款约束) */
export function toProviderRecords(list: unknown): ProviderRecord[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const { id, name, type } = item as { id?: unknown; name?: unknown; type?: unknown };
    if (typeof id !== "string" || !id.trim()) return [];
    if (typeof type !== "string" || !type.trim()) return [];
    if (typeof name !== "string") return [];
    return [{ ...item, id, name, type } as ProviderRecord];
  });
}

/** 白名单过滤后的翻译服务商清单(与向导第②步同源同序) */
export async function loadTranslationProviderRecords(): Promise<ProviderRecord[]> {
  const list = toProviderRecords(await smartsubIpc.getTranslationProviders());
  return filterProviders(list, SUBTITLE_TRANSLATION_PROVIDERS);
}

/** 云 ASR 实例(getAsrProviders):原样开放,无白名单(实例即开放面,同向导裁定) */
export async function loadAsrProviderRecords(): Promise<ProviderRecord[]> {
  return toProviderRecords(await smartsubIpc.getAsrProviders());
}

// ==================== 云 ASR 实例(OpenAI 兼容) ====================

/** 树内 AsrProviderType id(镜像;types/asrProvider.ts ASR_OPENAI_COMPATIBLE) */
export const ASR_OPENAI_COMPATIBLE = "openaiCompatible";

/** v1 开放的云 ASR 实例类型:OpenAI 兼容端点(多实例);其余树内类型暂不开放创建 */
export const ASR_INSTANCE_FIELD_SPECS: ProviderFieldSpec[] = [
  { key: "apiUrl", label: "Base URL", type: "text", placeholder: "https://api.openai.com/v1" },
  { key: "apiKey", label: "API Key", type: "password" },
  { key: "models", label: "模型(逗号分隔)", type: "text", placeholder: "whisper-1" },
  { key: "requestTimeoutSec", label: "请求超时(秒)", type: "number", step: 10 },
  { key: "concurrency", label: "并发数", type: "number", step: 1 },
  { key: "requestInterval", label: "请求间隔(秒)", type: "number", step: 0.1 },
];

/** 新建 OpenAI 兼容实例的缺省值(对齐树内 ASR_PROVIDER_TYPES openaiCompatible 条目 defaultValue) */
export function newAsrInstance(seq: number): ProviderRecord {
  return {
    id: crypto.randomUUID(),
    name: `OpenAI 兼容实例 ${seq}`,
    type: ASR_OPENAI_COMPATIBLE,
    apiUrl: "https://api.openai.com/v1",
    apiKey: "",
    models: ["whisper-1"],
    requestTimeoutSec: 120,
    concurrency: 4,
    requestInterval: 0,
  };
}

/** models 字段(数组或逗号分隔字符串,主进程 parseAsrModels 两种都收)→ 输入框文本 */
export function asrModelsToText(value: unknown): string {
  if (Array.isArray(value)) return value.map((m) => String(m).trim()).filter(Boolean).join(", ");
  if (typeof value === "string") return value;
  return "";
}

/** 输入框文本 → models 数组(对齐树内 parseAsrModels 的分隔符集合) */
export function asrModelsFromText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,，、;；\n]/)) {
    const model = part.trim();
    if (model && !seen.has(model)) {
      seen.add(model);
      out.push(model);
    }
  }
  return out;
}

// ==================== 服务商健康 ====================

/** getProviderHealth 返回项 */
export interface ProviderHealthRecord {
  kind: string;
  id: string;
  status: string;
  checkedAt: number;
}

export function toHealthRecords(list: unknown): ProviderHealthRecord[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const { kind, id, status, checkedAt } = item as {
      kind?: unknown;
      id?: unknown;
      status?: unknown;
      checkedAt?: unknown;
    };
    if (typeof kind !== "string" || typeof id !== "string" || typeof status !== "string") return [];
    return [{ kind, id, status, checkedAt: typeof checkedAt === "number" ? checkedAt : 0 }];
  });
}

export async function loadProviderHealth(): Promise<ProviderHealthRecord[]> {
  return toHealthRecords(await smartsubIpc.getProviderHealth());
}

// ==================== 杂项 ====================

/** 字节数/秒 → 速度文本 */
export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let value = bytesPerSecond;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** 秒 → 剩余时间文本 */
export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.ceil(seconds % 60);
  if (minutes < 60) return `${minutes}m${rest ? ` ${rest}s` : ""}`;
  return `${Math.floor(minutes / 60)}h${minutes % 60}m`;
}

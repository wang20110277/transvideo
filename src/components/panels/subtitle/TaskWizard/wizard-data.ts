// 任务向导非组件数据源:引擎标签/语言表/服务商加载/字体清单/文件映射/素材路径解析。
// IPC 返回(getTranslationProviders/getAsrProviders/getSettings/subtitleMerge:listFonts)
// 在树内类型之外还可能是 null 或字段缺失——这里全部按 unknown 运行时校验,绝不信任形状。
import { smartsubIpc } from "@/lib/smartsub-ipc";
import { generateUUID } from "@/lib/utils";
import {
  filterProviders,
  SUBTITLE_TRANSLATION_PROVIDERS,
} from "@/stores/subtitle-feature-flags";
import type { SubtitleEngineId } from "@/stores/subtitle-feature-flags";
import type { WizardFile } from "@/stores/subtitle-studio-store";
import type { MediaFile } from "@/types/media";

// ==================== 引擎 ====================

/**
 * v1 开放引擎(= Task 9 白名单 SUBTITLE_ENGINES 本体,静态两档)。
 * 注:brief 设想的「引擎下拉 = getAsrProviders() 过滤 SUBTITLE_ENGINES」不成立——
 * getAsrProviders 返回的是用户配置的云 ASR 实例(实例 id,缺省空表),不是引擎清单;
 * 引擎 id('builtin'/'cloud')来自树内 TranscriptionEngine 子集,唯一权威来源就是白名单。
 */
export const ENGINE_OPTIONS: Array<{
  id: SubtitleEngineId;
  label: string;
  hint: string;
}> = [
  { id: "builtin", label: "内置引擎(本地 Whisper)", hint: "本地运行,无需联网配置" },
  { id: "cloud", label: "云端听写", hint: "需选择云 ASR 服务商实例" },
];

// ==================== 服务商 ====================

export interface ProviderOption {
  id: string;
  name: string;
}

/** unknown 列表 → {id,name}[];非对象/缺 id 的项丢弃,name 缺失回落 id */
function toProviderOptions(list: unknown): ProviderOption[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const { id, name } = item as { id?: unknown; name?: unknown };
    if (typeof id !== "string" || !id) return [];
    return [{ id, name: typeof name === "string" && name ? name : id }];
  });
}

/** 翻译服务商(经 Task 9 filterProviders 按 v1 白名单过滤) */
export async function loadTranslationProviders(): Promise<ProviderOption[]> {
  const list = toProviderOptions(await smartsubIpc.getTranslationProviders());
  return filterProviders(list, SUBTITLE_TRANSLATION_PROVIDERS);
}

/**
 * 云端听写实例(engine=cloud 时 asrProviderId 的数据源)。
 * 实例由用户配置(getAsrProviders),无引擎白名单可言,原样开放。
 */
export async function loadAsrProviders(): Promise<ProviderOption[]> {
  return toProviderOptions(await smartsubIpc.getAsrProviders());
}

// ==================== 语言 ====================

export interface LanguageOption {
  name: string;
  value: string;
}

/**
 * 内置语言表:镜像移植树 helpers/utils.ts supportedLanguage 的 name/value 对
 * (树内该表只存在于主进程 helpers,无 IPC 暴露;renderer 值导入被 lint 禁止,
 * 故此处同步一份——上游树增删语言时需同步此处)。
 */
export const BUILTIN_LANGUAGE_OPTIONS: LanguageOption[] = [
  { name: "中文", value: "zh" },
  { name: "英语", value: "en" },
  { name: "日语", value: "ja" },
  { name: "韩语", value: "ko" },
  { name: "法语", value: "fr" },
  { name: "德语", value: "de" },
  { name: "西班牙语", value: "es" },
  { name: "俄语", value: "ru" },
  { name: "葡萄牙语", value: "pt" },
  { name: "意大利语", value: "it" },
  { name: "荷兰语", value: "nl" },
  { name: "波兰语", value: "pl" },
  { name: "土耳其语", value: "tr" },
  { name: "瑞典语", value: "sv" },
  { name: "捷克语", value: "cs" },
  { name: "丹麦语", value: "da" },
  { name: "芬兰语", value: "fi" },
  { name: "希腊语", value: "el" },
  { name: "匈牙利语", value: "hu" },
  { name: "挪威语", value: "no" },
  { name: "罗马尼亚语", value: "ro" },
  { name: "斯洛伐克语", value: "sk" },
  { name: "克罗地亚语", value: "hr" },
  { name: "塞尔维亚语", value: "sr" },
  { name: "斯洛文尼亚语", value: "sl" },
  { name: "保加利亚语", value: "bg" },
  { name: "乌克兰语", value: "uk" },
  { name: "爱沙尼亚语", value: "et" },
  { name: "拉脱维亚语", value: "lv" },
  { name: "立陶宛语", value: "lt" },
  { name: "印地语", value: "hi" },
  { name: "泰语", value: "th" },
  { name: "越南语", value: "vi" },
  { name: "印度尼西亚语", value: "id" },
  { name: "马来语", value: "ms" },
  { name: "泰米尔语", value: "ta" },
  { name: "乌尔都语", value: "ur" },
  { name: "马拉地语", value: "mr" },
  { name: "阿拉伯语", value: "ar" },
  { name: "希伯来语", value: "he" },
  { name: "波斯语", value: "fa" },
  { name: "阿非利堪斯语", value: "af" },
  { name: "加泰罗尼亚语", value: "ca" },
  { name: "加利西亚语", value: "gl" },
  { name: "塔加洛语", value: "tl" },
  { name: "斯瓦希里语", value: "sw" },
  { name: "威尔士语", value: "cy" },
  { name: "蒙古语", value: "mn" },
  { name: "繁体中文", value: "zh-Hant" },
  { name: "粤语", value: "yue" },
];

const AUTO_LANGUAGE: LanguageOption = { name: "自动检测", value: "auto" };

/**
 * 语言下拉数据:内置表 + getSettings().customLanguages(用户自定义语言)。
 * 探测结论:getSettings 返回的 settings 里没有 brief 设想的「语言表」字段,
 * 唯一语言相关数据是 settings.customLanguage({name,value}[]);内置表见上。
 */
export async function loadLanguageOptions(): Promise<{
  source: LanguageOption[];
  target: LanguageOption[];
}> {
  let custom: LanguageOption[] = [];
  try {
    const settings = await smartsubIpc.getSettings();
    const list = (settings as { customLanguages?: unknown } | null | undefined)
      ?.customLanguages;
    if (Array.isArray(list)) {
      custom = list.flatMap((item) => {
        if (typeof item !== "object" || item === null) return [];
        const { name, value } = item as { name?: unknown; value?: unknown };
        if (typeof value !== "string" || !value) return [];
        return [{ name: typeof name === "string" && name ? name : value, value }];
      });
    }
  } catch (error) {
    // 语言表增强失败不阻塞向导:回落纯内置表
    console.error("[subtitle-wizard] load customLanguages failed:", error);
  }
  const all = [...BUILTIN_LANGUAGE_OPTIONS, ...custom];
  return { source: [AUTO_LANGUAGE, ...all], target: all };
}

// ==================== 字体 ====================

export interface FontOption {
  name: string;
  available: boolean;
}

/**
 * 烧录字体清单:树内通道 subtitleMerge:listFonts(CHANNELS.md 已登记;
 * 返回 {success,data:[{name,available,...}]},data 含平台已知字体 + 已安装字体族)。
 * 经 window.ipcRenderer 直调:smartsubIpc wrapper(Task 8)未含该通道且本任务
 * 禁改 wrapper;后续任务若扩 wrapper,应把此处收回统一出口。
 */
export async function loadFontOptions(): Promise<FontOption[]> {
  try {
    const resp = await window.ipcRenderer?.invoke("subtitleMerge:listFonts");
    const data = (resp as { data?: unknown } | null | undefined)?.data;
    if (!Array.isArray(data)) return [];
    return data.flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];
      const { name, available } = item as { name?: unknown; available?: unknown };
      if (typeof name !== "string" || !name) return [];
      return [{ name, available: available === true }];
    });
  } catch (error) {
    console.error("[subtitle-wizard] listFonts failed:", error);
    return [];
  }
}

// ==================== 文件 ====================

/** 向导接受的视频扩展名(含点,小写;对齐常见容器格式) */
const VIDEO_EXTENSIONS = new Set([
  ".mp4", ".mkv", ".mov", ".avi", ".webm", ".flv", ".ts",
  ".m4v", ".mpg", ".mpeg", ".wmv", ".vob", ".3gp",
]);

export function isVideoFileName(name: string): boolean {
  const dot = name.lastIndexOf(".");
  return dot > 0 && VIDEO_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

/**
 * File(拖拽/文件选择器)→ WizardFile。
 * path 经 preload 的 smartsubBridge(webUtils.getPathForFile):只有来自 OS
 * 拖拽/选择器的 File 才带真实路径,合成 File(如测试构造)返回 ''——按路径不可用处理。
 */
export function fileToWizardFile(file: File): WizardFile {
  let path = "";
  try {
    path = window.smartsubBridge?.getPathForFile(file) ?? "";
  } catch (error) {
    console.error("[subtitle-wizard] getPathForFile failed:", error);
  }
  return { uuid: generateUUID(), name: file.name, path, size: file.size };
}

// ==================== 素材库 ====================

export interface MediaVideoOption {
  id: string;
  name: string;
  /** 解析出的本地绝对路径;null = 拿不到真实路径(禁选) */
  path: string | null;
  /** 禁选原因(空串 = 可选) */
  reason: string;
}

/**
 * 素材库视频条目 → 向导可选项。取径优先级(与素材面板一致):
 * 1) 条目仍持有会话内 File 对象(本次运行上传)→ webUtils 取绝对路径;
 * 2) url 为 local-image:// 协议(AI 生成/落盘媒体)→ 主进程 get-absolute-path;
 * 3) blob:/data:/http 等瞬态或远程 URL → 无法定位本地文件,禁选。
 */
export async function resolveMediaVideo(item: MediaFile): Promise<MediaVideoOption> {
  const name = item.name || "未命名素材";
  if (item.file instanceof File) {
    try {
      const path = window.smartsubBridge?.getPathForFile(item.file) ?? "";
      if (path) return { id: item.id, name, path, reason: "" };
    } catch (error) {
      console.error("[subtitle-wizard] getPathForFile(media) failed:", error);
    }
  }
  const url = typeof item.url === "string" ? item.url : "";
  if (url.startsWith("local-image://")) {
    try {
      const abs = (await window.imageStorage?.getAbsolutePath(url)) ?? null;
      if (abs) return { id: item.id, name, path: abs, reason: "" };
      return { id: item.id, name, path: null, reason: "本地文件缺失" };
    } catch (error) {
      console.error("[subtitle-wizard] getAbsolutePath failed:", error);
      return { id: item.id, name, path: null, reason: "路径解析失败" };
    }
  }
  return { id: item.id, name, path: null, reason: "非本地文件" };
}

/** 字节数 → 展示文本 */
export function formatFileSize(size: number | undefined): string {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

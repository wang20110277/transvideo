// 设置子页·输出选项:两类用户级字段的表单。
// ①任务与输出(getUserConfig/setUserConfig,send 全量替换 → 读改写合并):
//   并发数/字幕输出格式/源·译字幕保存选项(userConfig 实际字段,见树内
//   helpers/utils.ts defaultUserConfig);
// ②运行环境(getSettings/setSettings,invoke 增量合并):
//   代理(proxyMode/proxyUrl/proxyNoProxy,保存即生效 applyProxyFromSettings)/
//   任务期防休眠/转写上下文/VAD/抗重复(settings 实际字段,见树内 store/types)。
// setSettings 返回 {rejectedKeys}(CJK 路径等被主进程拒绝的键),非空时提示。
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { smartsubIpc } from "@/lib/smartsub-ipc";

/** 字幕输出格式(树内 SUBTITLE_OUTPUT_FORMATS 镜像) */
const OUTPUT_FORMATS = [
  { value: "srt", label: "SRT" },
  { value: "vtt", label: "VTT" },
  { value: "ass", label: "ASS" },
  { value: "lrc", label: "LRC" },
  { value: "txt", label: "TXT(纯文本)" },
];

/** 字幕文件保存选项(树内 sourceSrtSaveOption/targetSrtSaveOption 取值) */
const SAVE_OPTIONS = [
  { value: "noSave", label: "不保存(仅任务内使用)" },
  { value: "fileName", label: "按文件名" },
  { value: "fileNameWithLang", label: "文件名+语言" },
  { value: "custom", label: "自定义模板" },
];

const PROXY_MODES = [
  { value: "none", label: "直连(不使用代理)" },
  { value: "custom", label: "自定义代理" },
];

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** 字符串化表单态(userConfig 子集) */
interface OutputForm {
  maxConcurrentTasks: string;
  subtitleOutputFormat: string;
  targetSrtSaveOption: string;
  sourceSrtSaveOption: string;
  customTargetSrtFileName: string;
  customSourceSrtFileName: string;
}

/** 字符串化表单态(settings 子集) */
interface EnvForm {
  proxyMode: string;
  proxyUrl: string;
  proxyNoProxy: string;
  preventSleepDuringTask: boolean;
  maxContext: string;
  useVAD: boolean;
  reduceRepetition: boolean;
}

export function SubtitleSettings() {
  const [output, setOutput] = useState<OutputForm | null>(null);
  const [env, setEnv] = useState<EnvForm | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [savingOutput, setSavingOutput] = useState(false);
  const [savingEnv, setSavingEnv] = useState(false);

  const reload = useCallback(() => {
    return Promise.all([smartsubIpc.getUserConfig(), smartsubIpc.getSettings()])
      .then(([userConfig, settings]) => {
        const c = (userConfig ?? {}) as Record<string, unknown>;
        const s = (settings ?? {}) as Record<string, unknown>;
        setOutput({
          maxConcurrentTasks: String(num(c.maxConcurrentTasks, 1)),
          subtitleOutputFormat: str(c.subtitleOutputFormat, "srt"),
          targetSrtSaveOption: str(c.targetSrtSaveOption, "fileNameWithLang"),
          sourceSrtSaveOption: str(c.sourceSrtSaveOption, "noSave"),
          customTargetSrtFileName: str(c.customTargetSrtFileName, "${fileName}.${targetLanguage}"),
          customSourceSrtFileName: str(c.customSourceSrtFileName, "${fileName}.${sourceLanguage}"),
        });
        setEnv({
          proxyMode: str(s.proxyMode, "none") === "custom" ? "custom" : "none",
          proxyUrl: str(s.proxyUrl),
          proxyNoProxy: str(s.proxyNoProxy),
          preventSleepDuringTask: s.preventSleepDuringTask !== false,
          maxContext: String(num(s.maxContext, -1)),
          useVAD: s.useVAD !== false,
          reduceRepetition: s.reduceRepetition === true,
        });
        setLoadFailed(false);
      })
      .catch((error) => {
        console.error("[subtitle-settings] load settings failed:", error);
        setLoadFailed(true);
      });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const saveOutput = () => {
    if (!output || savingOutput) return;
    setSavingOutput(true);
    // setUserConfig 是 send 全量替换:读改写——先取当前全量,仅覆盖表单字段
    (async () => {
      const current = (await smartsubIpc.getUserConfig()) as Record<string, unknown> | null;
      const merged = {
        ...(current ?? {}),
        maxConcurrentTasks: Math.max(1, Math.min(5, Number(output.maxConcurrentTasks) || 1)),
        subtitleOutputFormat: output.subtitleOutputFormat,
        targetSrtSaveOption: output.targetSrtSaveOption,
        sourceSrtSaveOption: output.sourceSrtSaveOption,
        customTargetSrtFileName: output.customTargetSrtFileName,
        customSourceSrtFileName: output.customSourceSrtFileName,
      };
      smartsubIpc.setUserConfig(merged);
      // send 无回执:回读确认落盘(send→invoke 的处理顺序通常成立,但仍留
      // 短重试容忍跨进程竞态,避免误报「未生效」)
      const expected = Math.max(1, Math.min(5, Number(output.maxConcurrentTasks) || 1));
      let confirmed = false;
      for (let attempt = 0; attempt < 10 && !confirmed; attempt += 1) {
        const reread = (await smartsubIpc.getUserConfig()) as Record<string, unknown> | null;
        confirmed = Number((reread ?? {}).maxConcurrentTasks) === expected;
        if (!confirmed) await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (confirmed) {
        toast.success("任务与输出选项已保存");
      } else {
        toast.error("保存可能未生效,请重试");
      }
    })()
      .catch((error) => {
        console.error("[subtitle-settings] setUserConfig failed:", error);
        toast.error("保存任务与输出选项失败");
      })
      .finally(() => setSavingOutput(false));
  };

  const saveEnv = () => {
    if (!env || savingEnv) return;
    setSavingEnv(true);
    smartsubIpc
      .setSettings({
        proxyMode: env.proxyMode === "custom" ? "custom" : "none",
        proxyUrl: env.proxyUrl.trim(),
        proxyNoProxy: env.proxyNoProxy.trim(),
        preventSleepDuringTask: env.preventSleepDuringTask,
        maxContext: Number(env.maxContext) || -1,
        useVAD: env.useVAD,
        reduceRepetition: env.reduceRepetition,
      })
      .then((result) => {
        const rejected = (result as { rejectedKeys?: unknown } | null | undefined)?.rejectedKeys;
        if (Array.isArray(rejected) && rejected.length > 0) {
          toast.warning(`部分字段被拒绝(含非法字符):${rejected.map(String).join(", ")}`);
        } else {
          toast.success("运行环境选项已保存");
        }
      })
      .catch((error) => {
        console.error("[subtitle-settings] setSettings failed:", error);
        toast.error("保存运行环境选项失败");
      })
      .finally(() => setSavingEnv(false));
  };

  if (loadFailed) {
    return (
      <div className="flex flex-col gap-2" data-settings-output>
        <p className="text-xs text-destructive">设置读取失败,请刷新或查看控制台日志</p>
        <Button variant="outline" size="sm" className="w-fit" onClick={reload}>
          重试
        </Button>
      </div>
    );
  }

  if (!output || !env) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground" data-settings-output>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        正在读取设置…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-settings-output>
      {/* ① 任务与输出(userConfig) */}
      <section className="flex flex-col gap-4 rounded-lg border border-border p-4">
        <header className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">任务与输出</h3>
          <span className="text-xs text-muted-foreground">新任务的默认值</span>
          <Button
            size="sm"
            className="ml-auto h-7 px-2 text-xs"
            disabled={savingOutput}
            onClick={saveOutput}
            data-save-output
          >
            {savingOutput && <Loader2 className="h-3 w-3 animate-spin" />}
            保存
          </Button>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">任务并发数(1-5)</Label>
            <Input
              type="number"
              min={1}
              max={5}
              value={output.maxConcurrentTasks}
              className="h-8 w-32 text-sm"
              data-output-field="maxConcurrentTasks"
              onChange={(e) => setOutput({ ...output, maxConcurrentTasks: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">字幕输出格式</Label>
            <Select
              value={output.subtitleOutputFormat}
              onValueChange={(value) => setOutput({ ...output, subtitleOutputFormat: value })}
            >
              <SelectTrigger className="h-8 w-44 text-sm" data-output-field="subtitleOutputFormat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTPUT_FORMATS.map((format) => (
                  <SelectItem key={format.value} value={format.value}>
                    {format.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">译文字幕保存</Label>
            <Select
              value={output.targetSrtSaveOption}
              onValueChange={(value) => setOutput({ ...output, targetSrtSaveOption: value })}
            >
              <SelectTrigger className="h-8 w-52 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SAVE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {output.targetSrtSaveOption === "custom" && (
              <Input
                value={output.customTargetSrtFileName}
                className="h-8 font-mono text-xs"
                placeholder="${fileName}.${targetLanguage}"
                onChange={(e) => setOutput({ ...output, customTargetSrtFileName: e.target.value })}
              />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">源语言字幕保存</Label>
            <Select
              value={output.sourceSrtSaveOption}
              onValueChange={(value) => setOutput({ ...output, sourceSrtSaveOption: value })}
            >
              <SelectTrigger className="h-8 w-52 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SAVE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {output.sourceSrtSaveOption === "custom" && (
              <Input
                value={output.customSourceSrtFileName}
                className="h-8 font-mono text-xs"
                placeholder="${fileName}.${sourceLanguage}"
                onChange={(e) => setOutput({ ...output, customSourceSrtFileName: e.target.value })}
              />
            )}
          </div>
        </div>
      </section>

      {/* ② 运行环境(settings) */}
      <section className="flex flex-col gap-4 rounded-lg border border-border p-4">
        <header className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">运行环境</h3>
          <Button
            size="sm"
            className="ml-auto h-7 px-2 text-xs"
            disabled={savingEnv}
            onClick={saveEnv}
            data-save-env
          >
            {savingEnv && <Loader2 className="h-3 w-3 animate-spin" />}
            保存
          </Button>
        </header>

        <div className="flex flex-col gap-3 rounded-md bg-muted/40 px-3 py-2.5">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">网络代理</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={env.proxyMode}
                onValueChange={(value) => setEnv({ ...env, proxyMode: value })}
              >
                <SelectTrigger className="h-8 w-44 text-sm" data-env-field="proxyMode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROXY_MODES.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {env.proxyMode === "custom" && (
                <Input
                  value={env.proxyUrl}
                  className="h-8 flex-1 font-mono text-xs"
                  placeholder="http://user:pass@host:port"
                  data-env-field="proxyUrl"
                  onChange={(e) => setEnv({ ...env, proxyUrl: e.target.value })}
                />
              )}
            </div>
            {env.proxyMode === "custom" && (
              <Input
                value={env.proxyNoProxy}
                className="h-8 w-64 font-mono text-xs"
                placeholder="NO_PROXY(逗号分隔,默认 localhost,127.0.0.1)"
                onChange={(e) => setEnv({ ...env, proxyNoProxy: e.target.value })}
              />
            )}
            <p className="text-xs text-muted-foreground">代理对模型下载与云端服务商请求生效,保存后即时应用</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
            <div className="flex min-w-0 flex-col">
              <span className="text-sm">任务运行期间阻止系统休眠</span>
              <span className="text-xs text-muted-foreground">防止长任务被系统睡眠中断</span>
            </div>
            <Switch
              checked={env.preventSleepDuringTask}
              onCheckedChange={(checked) => setEnv({ ...env, preventSleepDuringTask: checked })}
            />
          </div>
          <div className="flex flex-col justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5">
            <Label className="text-xs text-muted-foreground">转写上下文携带(-1 = 不限)</Label>
            <Input
              type="number"
              value={env.maxContext}
              className="h-8 w-32 text-sm"
              data-env-field="maxContext"
              onChange={(e) => setEnv({ ...env, maxContext: e.target.value })}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
            <div className="flex min-w-0 flex-col">
              <span className="text-sm">VAD 人声活动检测</span>
              <span className="text-xs text-muted-foreground">先切分人声段再转写,减少幻觉</span>
            </div>
            <Switch
              checked={env.useVAD}
              onCheckedChange={(checked) => setEnv({ ...env, useVAD: checked })}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
            <div className="flex min-w-0 flex-col">
              <span className="text-sm">抗重复/抗幻觉</span>
              <span className="text-xs text-muted-foreground">断开上文条件并抑制重复输出</span>
            </div>
            <Switch
              checked={env.reduceRepetition}
              onCheckedChange={(checked) => setEnv({ ...env, reduceRepetition: checked })}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

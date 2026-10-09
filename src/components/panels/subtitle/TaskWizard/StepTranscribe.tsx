// 向导第②步「转写与翻译」:引擎 / 云 ASR 实例 / 源·目标语言 / 翻译服务商 / 双语。
// 服务商全部经 v1 白名单过滤(Task 9 filterProviders);引擎=cloud 时必须选
// 云 ASR 实例(asrProviderId,树内 submitTask 校验必填);translateOn=false 时
// 隐藏服务商与目标语言。
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useSubtitleStudioStore } from "@/stores/subtitle-studio-store";
import {
  ENGINE_OPTIONS,
  loadAsrProviders,
  loadLanguageOptions,
  loadTranslationProviders,
  type LanguageOption,
  type ProviderOption,
} from "./wizard-data";

export function StepTranscribe() {
  const options = useSubtitleStudioStore((s) => s.wizardOptions);
  const setOptions = useSubtitleStudioStore((s) => s.setOptions);

  const [asrProviders, setAsrProviders] = useState<ProviderOption[] | null>(null);
  const [translationProviders, setTranslationProviders] = useState<ProviderOption[] | null>(null);
  const [languages, setLanguages] = useState<{
    source: LanguageOption[];
    target: LanguageOption[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadAsrProviders(), loadTranslationProviders(), loadLanguageOptions()])
      .then(([asr, translation, lang]) => {
        if (cancelled) return;
        setAsrProviders(asr);
        setTranslationProviders(translation);
        setLanguages(lang);
      })
      .catch((error) => {
        console.error("[subtitle-wizard] load providers failed:", error);
        if (cancelled) return;
        setAsrProviders([]);
        setTranslationProviders([]);
        setLanguages({ source: [], target: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 清单就绪后校正当前取值:取值不在清单内(如自定义实例被删)则回落首项,
  // 避免下拉显示空值而用户无感
  useEffect(() => {
    if (translationProviders === null) return;
    if (
      translationProviders.length > 0 &&
      !translationProviders.some((p) => p.id === options.translationProvider)
    ) {
      setOptions({ translationProvider: translationProviders[0].id });
    }
  }, [translationProviders, options.translationProvider, setOptions]);

  useEffect(() => {
    if (asrProviders === null) return;
    if (
      options.transcriptionEngine === "cloud" &&
      asrProviders.length > 0 &&
      !asrProviders.some((p) => p.id === options.asrProviderId)
    ) {
      setOptions({ asrProviderId: asrProviders[0].id });
    }
  }, [asrProviders, options.transcriptionEngine, options.asrProviderId, setOptions]);

  const engineHint = ENGINE_OPTIONS.find((e) => e.id === options.transcriptionEngine)?.hint;
  const loading = asrProviders === null || translationProviders === null || languages === null;

  return (
    <div className="flex flex-col gap-5 p-6">
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          正在读取引擎与服务商配置…
        </div>
      )}

      {/* 转写引擎 */}
      <div className="flex flex-col gap-2">
        <Label>转写引擎</Label>
        <Select
          value={options.transcriptionEngine}
          onValueChange={(value) => setOptions({ transcriptionEngine: value as typeof options.transcriptionEngine })}
        >
          <SelectTrigger>
            <SelectValue placeholder="选择转写引擎" />
          </SelectTrigger>
          <SelectContent>
            {ENGINE_OPTIONS.map((engine) => (
              <SelectItem key={engine.id} value={engine.id}>
                {engine.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {engineHint && <p className="text-xs text-muted-foreground">{engineHint}</p>}
      </div>

      {/* cloud 引擎:云 ASR 实例必选 */}
      {options.transcriptionEngine === "cloud" && (
        <div className="flex flex-col gap-2">
          <Label>云端听写服务商实例</Label>
          {(asrProviders ?? []).length === 0 ? (
            <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              尚未配置云端听写服务商实例,无法使用云端引擎;请先改用内置引擎,
              或在字幕设置中配置云 ASR 实例后重试
            </p>
          ) : (
            <Select
              value={options.asrProviderId ?? ""}
              onValueChange={(value) => setOptions({ asrProviderId: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择云 ASR 服务商实例" />
              </SelectTrigger>
              <SelectContent>
                {(asrProviders ?? []).map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* 源语言 */}
      <div className="flex flex-col gap-2">
        <Label>源语言</Label>
        <Select
          value={options.sourceLanguage}
          onValueChange={(value) => setOptions({ sourceLanguage: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="选择源语言" />
          </SelectTrigger>
          <SelectContent>
            {(languages?.source ?? []).map((lang) => (
              <SelectItem key={lang.value} value={lang.value}>
                {lang.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 翻译开关 */}
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
        <div className="flex flex-col">
          <span className="text-sm font-medium">翻译字幕</span>
          <span className="text-xs text-muted-foreground">关闭后仅生成源语言字幕</span>
        </div>
        <Switch
          checked={options.translateOn}
          onCheckedChange={(checked) => setOptions({ translateOn: checked })}
        />
      </div>

      {/* 翻译相关选项(translateOn=false 时整体隐藏) */}
      {options.translateOn && (
        <>
          <div className="flex flex-col gap-2">
            <Label>翻译服务商</Label>
            <Select
              value={options.translationProvider}
              onValueChange={(value) => setOptions({ translationProvider: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择翻译服务商" />
              </SelectTrigger>
              <SelectContent>
                {(translationProviders ?? []).map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(translationProviders ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">暂无可用翻译服务商</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>目标语言</Label>
            <Select
              value={options.targetLanguage}
              onValueChange={(value) => setOptions({ targetLanguage: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择目标语言" />
              </SelectTrigger>
              <SelectContent>
                {(languages?.target ?? []).map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
            <div className="flex flex-col">
              <span className="text-sm font-medium">双语字幕</span>
              <span className="text-xs text-muted-foreground">源语言与译文同时输出</span>
            </div>
            <Switch
              checked={options.bilingual}
              onCheckedChange={(checked) => setOptions({ bilingual: checked })}
            />
          </div>
        </>
      )}
    </div>
  );
}

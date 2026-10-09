// 设置子页·服务商配置:①翻译服务商(v1 白名单,Task 9 filterProviders)API Key/
// 参数表单 + 测试连接;②云端听写(云 ASR)实例增删改——Task 11 疑虑 4 的解药,
// v1 开放 OpenAI 兼容端点多实例,其余树内类型只读展示;③云端配音(TTS)Phase 2 占位。
// 保存走 setTranslationProviders/setAsrProviders 的 invoke 形态(CAS:
// {providers, expectedProviders},他窗并发改动以冲突错误拒绝);测试连接走
// testTranslation(主动探测,顺带刷新健康缓存)/testAsrProvider,健康徽标读
// getProviderHealth(近 5min 缓存)。未在表单开放的字段保存时原样透传。
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { smartsubIpc } from "@/lib/smartsub-ipc";
import {
  filterProviders,
  SUBTITLE_TRANSLATION_PROVIDERS,
} from "@/stores/subtitle-feature-flags";
import {
  ASR_INSTANCE_FIELD_SPECS,
  ASR_OPENAI_COMPATIBLE,
  TRANSLATION_FIELD_SPECS,
  asrModelsFromText,
  asrModelsToText,
  loadProviderHealth,
  newAsrInstance,
  toProviderRecords,
  type ProviderFieldSpec,
  type ProviderHealthRecord,
  type ProviderRecord,
} from "./settings-data";

/** 字段值 → 输入框文本(models 数组特例转逗号串) */
function fieldToText(spec: ProviderFieldSpec, value: unknown): string {
  if (spec.key === "models") return asrModelsToText(value);
  if (value === undefined || value === null) return "";
  return String(value);
}

/** 输入框文本 → 字段值(number 规格转数字,models 特例转数组) */
function textToField(spec: ProviderFieldSpec, text: string): string | number | string[] {
  if (spec.key === "models") return asrModelsFromText(text);
  if (spec.type === "number") {
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return text;
}

/** 表单是否与实例当前值有差异(决定「保存」可用) */
function isDirty(provider: ProviderRecord, specs: ProviderFieldSpec[], form: Record<string, string>): boolean {
  return specs.some((spec) => {
    const current = fieldToText(spec, provider[spec.key]);
    const edited = form[spec.key] ?? "";
    if (spec.type === "number") return Number(edited || 0) !== Number(current || 0);
    if (spec.key === "models") return asrModelsFromText(edited).join("\u0000") !== asrModelsFromText(current).join("\u0000");
    return edited !== current;
  });
}

/** 合并表单到实例(只覆盖开放字段,其余透传) */
function applyForm(provider: ProviderRecord, specs: ProviderFieldSpec[], form: Record<string, string>): ProviderRecord {
  const next: ProviderRecord = { ...provider };
  for (const spec of specs) {
    next[spec.key] = textToField(spec, form[spec.key] ?? fieldToText(spec, provider[spec.key]));
  }
  return next;
}

function initForm(provider: ProviderRecord, specs: ProviderFieldSpec[]): Record<string, string> {
  return Object.fromEntries(specs.map((spec) => [spec.key, fieldToText(spec, provider[spec.key])]));
}

/** 健康徽标(近 5min 测试缓存;kind+id 匹配) */
function HealthBadge({ health, kind, id }: { health: ProviderHealthRecord[]; kind: string; id: string }) {
  const record = health.find((h) => h.kind === kind && h.id === id);
  if (!record) return null;
  return record.status === "connected" ? (
    <Badge variant="secondary">连接正常</Badge>
  ) : (
    <Badge variant="destructive">连接失败</Badge>
  );
}

// ==================== 翻译服务商卡片 ====================

function TranslationProviderCard({
  provider,
  health,
  onSave,
  onTest,
  saving,
  testing,
}: {
  provider: ProviderRecord;
  health: ProviderHealthRecord[];
  onSave: (merged: ProviderRecord) => void;
  onTest: (merged: ProviderRecord) => void;
  saving: boolean;
  testing: boolean;
}) {
  const specs = useMemo(
    () => TRANSLATION_FIELD_SPECS[provider.id] ?? [],
    [provider.id],
  );
  const [form, setForm] = useState<Record<string, string>>(() => initForm(provider, specs));
  // 列表重载换引用时重置表单(key=id,外部数据变化经 key 重挂载兜底,此处防御式同步)
  useEffect(() => {
    setForm(initForm(provider, specs));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);
  const dirty = useMemo(() => isDirty(provider, specs, form), [provider, specs, form]);
  const merged = useMemo(() => applyForm(provider, specs, form), [provider, specs, form]);

  if (specs.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4" data-translation-provider={provider.id}>
      <header className="flex items-center gap-2">
        <span className="text-sm font-semibold">{String(provider.name || provider.id)}</span>
        {provider.isAi === true && <Badge variant="outline">AI</Badge>}
        <div className="ml-auto flex items-center gap-2">
          <HealthBadge health={health} kind="translation" id={provider.id} />
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={testing}
            onClick={() => onTest(merged)}
          >
            {testing && <Loader2 className="h-3 w-3 animate-spin" />}
            测试连接
          </Button>
          <Button size="sm" className="h-7 px-2 text-xs" disabled={!dirty || saving} onClick={() => onSave(merged)}>
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            保存
          </Button>
        </div>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        {specs.map((spec) => (
          <div key={spec.key} className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{spec.label}</Label>
            <Input
              type={spec.type === "password" ? "password" : spec.type === "number" ? "number" : "text"}
              step={spec.step}
              value={form[spec.key] ?? ""}
              placeholder={spec.placeholder}
              className="h-8 text-sm"
              data-provider-field={`${provider.id}.${spec.key}`}
              onChange={(event) => setForm((prev) => ({ ...prev, [spec.key]: event.target.value }))}
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        免费通道(bingFree/googleFree)无需凭据,可直接在任务向导使用;AI 服务商需填 API Key。
      </p>
    </section>
  );
}

// ==================== 云 ASR 实例卡片 ====================

function AsrInstanceCard({
  instance,
  health,
  onSave,
  onTest,
  onDelete,
  saving,
  testing,
}: {
  instance: ProviderRecord;
  health: ProviderHealthRecord[];
  onSave: (merged: ProviderRecord) => void;
  onTest: (merged: ProviderRecord) => void;
  onDelete: () => void;
  saving: boolean;
  testing: boolean;
}) {
  const editable = instance.type === ASR_OPENAI_COMPATIBLE;
  const specs = useMemo(
    () => (editable ? ASR_INSTANCE_FIELD_SPECS : []),
    [editable],
  );
  const [name, setName] = useState(String(instance.name || ""));
  const [form, setForm] = useState<Record<string, string>>(() => initForm(instance, specs));
  useEffect(() => {
    setName(String(instance.name || ""));
    setForm(initForm(instance, specs));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance]);
  const merged = useMemo(() => {
    const base = applyForm(instance, specs, form);
    return { ...base, name };
  }, [instance, specs, form, name]);
  const dirty = editable && (name !== String(instance.name || "") || isDirty(instance, specs, form));

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4" data-asr-instance={instance.id}>
      <header className="flex items-center gap-2">
        {editable ? (
          <Input
            value={name}
            className="h-8 w-56 text-sm font-medium"
            data-asr-field={`${instance.id}.name`}
            onChange={(event) => setName(event.target.value)}
          />
        ) : (
          <span className="text-sm font-semibold">{String(instance.name || instance.id)}</span>
        )}
        <Badge variant="outline">{instance.type}</Badge>
        <div className="ml-auto flex items-center gap-2">
          <HealthBadge health={health} kind="asr" id={instance.id} />
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={testing}
            onClick={() => onTest(merged)}
          >
            {testing && <Loader2 className="h-3 w-3 animate-spin" />}
            测试连接
          </Button>
          {editable && (
            <Button size="sm" className="h-7 px-2 text-xs" disabled={!dirty || saving} onClick={() => onSave(merged)}>
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              保存
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </Button>
        </div>
      </header>
      {editable ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {specs.map((spec) => (
            <div key={spec.key} className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">{spec.label}</Label>
              <Input
                type={spec.type === "password" ? "password" : spec.type === "number" ? "number" : "text"}
                step={spec.step}
                value={form[spec.key] ?? ""}
                placeholder={spec.placeholder}
                className="h-8 text-sm"
                data-asr-field={`${instance.id}.${spec.key}`}
                onChange={(event) => setForm((prev) => ({ ...prev, [spec.key]: event.target.value }))}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          该实例类型({String(instance.type)})在 v1 设置页暂不支持编辑,仅可测试/删除;任务向导可正常选用。
        </p>
      )}
    </section>
  );
}

// ==================== 主组件 ====================

export function ProviderSettings() {
  // 翻译服务商:白名单过滤后的展示表 + 全量表快照(保存 CAS 需要)
  const [translationAll, setTranslationAll] = useState<ProviderRecord[] | null>(null);
  const [translationVisible, setTranslationVisible] = useState<ProviderRecord[]>([]);
  const [asrAll, setAsrAll] = useState<ProviderRecord[] | null>(null);
  const [health, setHealth] = useState<ProviderHealthRecord[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [savingTranslationId, setSavingTranslationId] = useState<string | null>(null);
  const [testingTranslationId, setTestingTranslationId] = useState<string | null>(null);
  const [savingAsrId, setSavingAsrId] = useState<string | null>(null);
  const [testingAsrId, setTestingAsrId] = useState<string | null>(null);

  const reload = useCallback(() => {
    return Promise.all([
      smartsubIpc.getTranslationProviders(),
      smartsubIpc.getAsrProviders(),
      loadProviderHealth(),
    ])
      .then(([translation, asr, healthRecords]) => {
        const all = toProviderRecords(translation);
        setTranslationAll(all);
        // 与向导第②步同源过滤(Task 9 白名单)
        setTranslationVisible(filterProviders(all, SUBTITLE_TRANSLATION_PROVIDERS));
        setAsrAll(toProviderRecords(asr));
        setHealth(healthRecords);
        setLoadFailed(false);
      })
      .catch((error) => {
        console.error("[subtitle-settings] load providers failed:", error);
        setLoadFailed(true);
      });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  /** CAS 保存失败(PROVIDER_SETTINGS_CONFLICT 等)统一处理:提示 + 重载 */
  const handleSaveError = (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("PROVIDER_SETTINGS_CONFLICT")) {
      toast.error("配置已被其他窗口修改,已重新加载,请重试");
    } else {
      toast.error(fallback);
    }
    reload();
  };

  const saveTranslation = (merged: ProviderRecord) => {
    if (!translationAll) return;
    const providers = translationAll.map((p) => (p.id === merged.id ? merged : p));
    setSavingTranslationId(merged.id);
    smartsubIpc
      .setTranslationProviders({ providers, expectedProviders: translationAll })
      .then(() => {
        toast.success(`服务商 ${String(merged.name)} 已保存`);
        return reload();
      })
      .catch((error) => {
        console.error("[subtitle-settings] setTranslationProviders failed:", error);
        handleSaveError(error, "保存翻译服务商失败");
      })
      .finally(() => setSavingTranslationId(null));
  };

  const testTranslation = (merged: ProviderRecord) => {
    setTestingTranslationId(merged.id);
    smartsubIpc
      .testTranslation({ provider: merged, sourceLanguage: "en", targetLanguage: "zh" })
      .then((result) => {
        const translation = (result as { translation?: unknown } | null | undefined)?.translation;
        if (typeof translation === "string" && translation) {
          toast.success(`连接正常,试译:${translation.slice(0, 30)}`);
        } else {
          toast.error("测试未返回译文,请检查配置");
        }
        return reload();
      })
      .catch((error) => {
        console.error("[subtitle-settings] testTranslation failed:", error);
        toast.error(`连接失败:${error instanceof Error ? error.message : String(error)}`);
        return reload();
      })
      .finally(() => setTestingTranslationId(null));
  };

  const saveAsr = (merged: ProviderRecord, list: ProviderRecord[], expected: ProviderRecord[], action: string) => {
    setSavingAsrId(merged.id);
    smartsubIpc
      .setAsrProviders({ providers: list, expectedProviders: expected })
      .then(() => {
        toast.success(`实例 ${String(merged.name)} 已${action}`);
        return reload();
      })
      .catch((error) => {
        console.error("[subtitle-settings] setAsrProviders failed:", error);
        handleSaveError(error, `云 ASR 实例${action}失败`);
      })
      .finally(() => setSavingAsrId(null));
  };

  const addAsrInstance = () => {
    if (asrAll === null || savingAsrId !== null) return;
    const instance = newAsrInstance(asrAll.length + 1);
    saveAsr(instance, [...asrAll, instance], asrAll, "创建");
  };

  const deleteAsrInstance = (instance: ProviderRecord) => {
    if (!asrAll) return;
    saveAsr(instance, asrAll.filter((p) => p.id !== instance.id), asrAll, "删除");
  };

  const testAsr = (merged: ProviderRecord) => {
    setTestingAsrId(merged.id);
    smartsubIpc
      .testAsrProvider(merged)
      .then((result) => {
        const r = result as { ok?: unknown; needsConfig?: unknown; detail?: unknown } | null | undefined;
        if (r?.ok === true) {
          toast.success("云 ASR 实例连接正常");
        } else if (r?.needsConfig === true) {
          toast.error("请先填写 API Key 等必填配置");
        } else {
          toast.error(`连接失败:${typeof r?.detail === "string" ? r.detail : "未知原因"}`);
        }
        return reload();
      })
      .catch((error) => {
        console.error("[subtitle-settings] testAsrProvider failed:", error);
        toast.error(`连接失败:${error instanceof Error ? error.message : String(error)}`);
        return reload();
      })
      .finally(() => setTestingAsrId(null));
  };

  return (
    <div className="flex flex-col gap-5" data-settings-providers>
      {loadFailed && (
        <p className="text-xs text-destructive">服务商配置读取失败,请刷新或查看控制台日志</p>
      )}

      {/* ① 翻译服务商 */}
      <section className="flex flex-col gap-3">
        <header className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">翻译服务商</h3>
          <span className="text-xs text-muted-foreground">仅显示 v1 开放白名单内的服务商</span>
        </header>
        {translationAll === null && !loadFailed && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在读取服务商配置…
          </div>
        )}
        {translationVisible.length === 0 && translationAll !== null && (
          <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            白名单内暂无已初始化的服务商实例
          </p>
        )}
        {translationVisible.map((provider) => (
          <TranslationProviderCard
            key={provider.id}
            provider={provider}
            health={health}
            saving={savingTranslationId === provider.id}
            testing={testingTranslationId === provider.id}
            onSave={saveTranslation}
            onTest={testTranslation}
          />
        ))}
      </section>

      {/* ② 云端听写(云 ASR)实例 */}
      <section className="flex flex-col gap-3">
        <header className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">云端听写服务商实例</h3>
          <span className="text-xs text-muted-foreground">供任务向导「云端听写」引擎选用</span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-7 px-2 text-xs"
            disabled={asrAll === null || savingAsrId !== null}
            onClick={addAsrInstance}
            data-asr-add
          >
            <Plus className="h-3.5 w-3.5" />
            添加 OpenAI 兼容实例
          </Button>
        </header>
        {asrAll === null && !loadFailed && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在读取实例列表…
          </div>
        )}
        {asrAll !== null && asrAll.length === 0 && (
          <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground" data-asr-empty>
            尚无云端听写实例;「云端听写」引擎需至少一个实例方可使用(内置引擎不受影响)
          </p>
        )}
        {asrAll?.map((instance) => (
          <AsrInstanceCard
            key={instance.id}
            instance={instance}
            health={health}
            saving={savingAsrId === instance.id}
            testing={testingAsrId === instance.id}
            onSave={(merged) => saveAsr(merged, (asrAll ?? []).map((p) => (p.id === merged.id ? merged : p)), asrAll ?? [], "保存")}
            onTest={testAsr}
            onDelete={() => deleteAsrInstance(instance)}
          />
        ))}
      </section>

      {/* ③ 云端配音(TTS) */}
      <section className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
        <h3 className="text-sm font-semibold">云端配音服务商</h3>
        <p className="text-xs text-muted-foreground">Phase 2 开放,敬请期待</p>
      </section>
    </div>
  );
}

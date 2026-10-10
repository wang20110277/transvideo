// 任务向导容器:三步(①选素材 ②转写翻译 ④合成提交)Dialog + 步骤条 + 底部操作。
// 步骤条只允许回看已完成步骤,前进必须经「下一步」逐步校验;提交走 store.submit():
// 成功 → store 关向导 + refreshTasks,此处补 toast;失败(返回 {success:false} 或
// invoke reject)→ 向导保持打开,底部显示错误条(store.logLines 尾部)。
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSubtitleStudioStore } from "@/stores/subtitle-studio-store";
import { StepCompose } from "./StepCompose";
import { StepSource } from "./StepSource";
import { StepTranscribe } from "./StepTranscribe";

const STEPS = ["选择素材", "转写与翻译", "合成与提交"];

/** 烧录默认值只补一次(Task 11 裁定默认开;Task 9 store 默认 false 且禁改,
 * 组件挂载期外也只允许首开补一次,避免覆盖用户显式关闭) */
let burnDefaultApplied = false;

export function TaskWizard() {
  const wizardOpen = useSubtitleStudioStore((s) => s.wizardOpen);
  const wizardStep = useSubtitleStudioStore((s) => s.wizardStep);
  const wizardFiles = useSubtitleStudioStore((s) => s.wizardFiles);
  const wizardOptions = useSubtitleStudioStore((s) => s.wizardOptions);
  const setStep = useSubtitleStudioStore((s) => s.setStep);
  const setOptions = useSubtitleStudioStore((s) => s.setOptions);
  const closeWizard = useSubtitleStudioStore((s) => s.closeWizard);
  const submit = useSubtitleStudioStore((s) => s.submit);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 首次打开把烧录开关补成默认开(见 burnDefaultApplied 注释;effect 内改 store,
  // 避免渲染期外置 store 写入触发 useSyncExternalStore 告警)
  useEffect(() => {
    if (wizardOpen && !burnDefaultApplied) {
      burnDefaultApplied = true;
      if (!useSubtitleStudioStore.getState().wizardOptions.burn) {
        setOptions({ burn: true });
      }
    }
  }, [wizardOpen, setOptions]);

  /** 步骤校验:
   *  ① 至少一个文件且全部有真实路径(拖拽合成文件/路径丢失 → 路径为空)
   *  ② cloud 引擎必须已选云 ASR 实例(树内 submitTask 对 cloud 必填 asrProviderId) */
  const step0Valid = wizardFiles.length > 0 && wizardFiles.every((file) => file.path !== "");
  const step1Valid =
    wizardOptions.transcriptionEngine !== "cloud" || Boolean(wizardOptions.asrProviderId);
  const stepValid = [step0Valid, step1Valid, true];

  const handleNext = () => {
    if (wizardStep < 2 && stepValid[wizardStep]) setStep((wizardStep + 1) as 0 | 1 | 2);
  };

  const handleSubmit = async () => {
    if (submitting || !step0Valid || !step1Valid) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submit();
      if (useSubtitleStudioStore.getState().wizardOpen) {
        // store 约定:submitTask 失败时写 logLines 且不关向导——取尾部作为错误条
        const logs = useSubtitleStudioStore.getState().logLines;
        setSubmitError(logs[logs.length - 1] ?? "提交失败,请重试");
      } else {
        toast.success("任务已提交");
      }
    } catch (error) {
      // invoke 被 reject(handler 之外的异常)等路径
      setSubmitError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={wizardOpen}
      onOpenChange={(open) => {
        if (!open) closeWizard();
      }}
    >
      <DialogContent className="flex max-h-[85vh] w-[calc(100%-4rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        {/* 头部:标题 + 步骤条(仅允许回看已完成步骤) */}
        <header className="flex flex-col gap-3 border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">新建字幕任务</h2>
          <div className="flex items-center gap-1" data-wizard-steps>
            {STEPS.map((label, index) => {
              const state =
                index === wizardStep ? "current" : index < wizardStep ? "done" : "todo";
              return (
                <button
                  key={label}
                  type="button"
                  disabled={index >= wizardStep}
                  onClick={() => index < wizardStep && setStep(index as 0 | 1 | 2)}
                  className={cn(
                    "flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    index < wizardStep && "cursor-pointer hover:bg-muted/50",
                    index >= wizardStep && "cursor-not-allowed",
                    state === "current" ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]",
                      state === "current" && "border-primary bg-primary/10 font-medium",
                      state === "done" && "border-primary/40 bg-primary/10",
                      state === "todo" && "border-border",
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </header>

        {/* 步骤内容 */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            {wizardStep === 0 && <StepSource />}
            {wizardStep === 1 && <StepTranscribe />}
            {wizardStep === 2 && <StepCompose />}
          </ScrollArea>
        </div>

        {/* 底部:错误条 + 导航 */}
        <footer className="flex items-center gap-3 border-t border-border px-6 py-3">
          {submitError && (
            <p
              className="min-w-0 flex-1 truncate text-xs text-destructive"
              title={submitError}
              data-wizard-submit-error
            >
              {submitError}
            </p>
          )}
          <div className="ml-auto flex items-center gap-2">
            {wizardStep > 0 && (
              <Button variant="outline" onClick={() => setStep((wizardStep - 1) as 0 | 1 | 2)}>
                <ArrowLeft className="h-4 w-4" />
                上一步
              </Button>
            )}
            {wizardStep < 2 ? (
              <Button onClick={handleNext} disabled={!stepValid[wizardStep]} data-wizard-next>
                下一步
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={submitting || !step0Valid || !step1Valid}
                data-wizard-submit
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                提交任务
              </Button>
            )}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

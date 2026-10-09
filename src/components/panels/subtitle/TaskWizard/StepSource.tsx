// 向导第①步「选择素材」:三路输入(拖拽 / 浏览文件 / 素材库选取)+ 文件清单。
// 拖拽与文件选择器的 File 经 preload smartsubBridge(webUtils)取绝对路径;
// 素材库视频沿用素材面板取径方式(resolveMediaVideo),真实路径拿不到的条目禁选。
import { useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, Library, Plus, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, generateUUID } from "@/lib/utils";
import { useMediaStore } from "@/stores/media-store";
import { useSubtitleStudioStore } from "@/stores/subtitle-studio-store";
import type { WizardFile } from "@/stores/subtitle-studio-store";
import {
  fileToWizardFile,
  formatFileSize,
  isVideoFileName,
  resolveMediaVideo,
  type MediaVideoOption,
} from "./wizard-data";

/** File[] → WizardFile[];非视频文件跳过并 toast 提示 */
function pickVideoFiles(files: File[]): { accepted: WizardFile[]; skipped: number } {
  const accepted: WizardFile[] = [];
  let skipped = 0;
  for (const file of files) {
    if (!isVideoFileName(file.name)) {
      skipped += 1;
      continue;
    }
    accepted.push(fileToWizardFile(file));
  }
  return { accepted, skipped };
}

export function StepSource() {
  const wizardFiles = useSubtitleStudioStore((s) => s.wizardFiles);
  const addFiles = useSubtitleStudioStore((s) => s.addFiles);
  const removeFile = useSubtitleStudioStore((s) => s.removeFile);
  const mediaFiles = useMediaStore((s) => s.mediaFiles);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [mediaOptions, setMediaOptions] = useState<MediaVideoOption[] | null>(null);

  // 素材库视频条目解析(local-image:// 需异步经主进程);useMemo 保证引用稳定,
  // 避免 effect 因数组重建而循环
  const videoItems = useMemo(
    () => mediaFiles.filter((m) => m.type === "video" && !m.ephemeral),
    [mediaFiles],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const options = await Promise.all(videoItems.map(resolveMediaVideo));
      if (!cancelled) setMediaOptions(options);
    })();
    return () => {
      cancelled = true;
    };
  }, [videoItems]);

  const addLocalFiles = (files: File[]) => {
    if (files.length === 0) return;
    const { accepted, skipped } = pickVideoFiles(files);
    if (skipped > 0) toast.info(`已跳过 ${skipped} 个非视频文件`);
    if (accepted.length === 0) return;
    addFiles(accepted);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    addLocalFiles(Array.from(event.dataTransfer.files ?? []));
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    addLocalFiles(Array.from(event.target.files ?? []));
    event.target.value = ""; // 允许重复选择同一文件
  };

  const addFromLibrary = (option: MediaVideoOption) => {
    if (!option.path) return;
    addFiles([{ uuid: generateUUID(), name: option.name, path: option.path }]);
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* 拖拽区 + 浏览文件 */}
      <div
        data-wizard-dropzone
        onDrop={handleDrop}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        className={cn(
          "flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground transition-colors",
          dragging ? "border-primary bg-primary/5 text-primary" : "border-border",
        )}
      >
        <UploadCloud className="h-7 w-7" />
        <p className="text-sm">拖拽视频文件到此处</p>
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <FolderOpen className="h-4 w-4" />
          浏览文件
        </Button>
        <Input
          ref={inputRef}
          type="file"
          accept="video/*,.mp4,.mkv,.mov,.avi,.webm,.flv,.ts,.m4v,.mpg,.mpeg,.wmv"
          multiple
          className="hidden"
          onChange={handleInputChange}
        />
      </div>

      {/* 素材库 */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Library className="h-4 w-4" />
          从素材库选择
        </div>
        {mediaOptions === null ? (
          <p className="text-xs text-muted-foreground">正在读取素材库…</p>
        ) : mediaOptions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            素材库中还没有视频,可先在「素材」面板导入
          </p>
        ) : (
          <ScrollArea className="h-36 rounded-lg border border-border">
            <div className="flex flex-col divide-y divide-border">
              {mediaOptions.map((option) => {
                const added = wizardFiles.some((f) => f.path === option.path && option.path);
                const disabled = !option.path || added;
                return (
                  <div key={option.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm" title={option.name}>
                        {option.name}
                      </span>
                      {option.path ? (
                        <span className="truncate text-xs text-muted-foreground" title={option.path}>
                          {option.path}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{option.reason},不可选择</span>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-xs"
                      disabled={disabled}
                      onClick={() => addFromLibrary(option)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {added ? "已添加" : "添加"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </section>

      {/* 已选文件清单 */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">已选文件({wizardFiles.length})</span>
          {wizardFiles.length === 0 && (
            <span className="text-xs text-muted-foreground">至少选择一个视频后才能进入下一步</span>
          )}
        </div>
        {wizardFiles.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {wizardFiles.map((file) => (
              <div
                key={file.uuid}
                className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm" title={file.name}>
                      {file.name}
                    </span>
                    {file.size !== undefined && file.size > 0 && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                      </span>
                    )}
                  </div>
                  {file.path ? (
                    <span className="truncate text-xs text-muted-foreground" title={file.path}>
                      {file.path}
                    </span>
                  ) : (
                    <span className="text-xs text-destructive">
                      路径不可用(无法提交,请从磁盘重新选择)
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => removeFile(file.uuid)}
                  aria-label={`移除 ${file.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

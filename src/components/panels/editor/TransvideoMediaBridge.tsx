// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { useState } from "react";
import { Plus, Video, Image as ImageIcon, Music, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useMediaStore } from "@/stores/media-store";
import { useEditor } from "@editor/hooks/use-editor";
import { mediaFileToFile } from "./media-file-to-file";
import type { MediaFile } from "@/types/media";

/** 编辑器素材面板顶部的「TRANSVIDEO 素材库」直读分区 */
export function TransvideoMediaBridge() {
  const mediaFiles = useMediaStore((s) => s.mediaFiles);
  const projectId = useEditor((e) => e.project.getActiveOrNull()?.metadata.id ?? null);
  const [adding, setAdding] = useState<string | null>(null);

  const items = mediaFiles.filter(
    (m) => !m.ephemeral && (m.type === "video" || m.type === "image" || m.type === "audio"),
  );

  const handleAdd = async (mf: MediaFile) => {
    if (!projectId || adding) return;
    setAdding(mf.id);
    try {
      const file = await mediaFileToFile(mf);
      if (!file) {
        toast.error(`无法读取素材「${mf.name}」`);
        return;
      }
      const { EditorCore } = await import("@editor/core");
      const asset = await EditorCore.getInstance().media.addMediaAsset({
        projectId,
        asset: {
          name: mf.name,
          type: mf.type,
          file,
          url: URL.createObjectURL(file),
          width: mf.width,
          height: mf.height,
          duration: mf.duration,
          fps: mf.fps,
          thumbnailUrl: mf.thumbnailUrl,
        },
      });
      if (asset) toast.success(`已添加「${mf.name}」到素材面板`);
      else toast.error(`添加「${mf.name}」失败`);
    } catch (err) {
      console.error("bridge add failed:", err);
      toast.error(`添加「${mf.name}」失败`);
    } finally {
      setAdding(null);
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="border-b border-border p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        TRANSVIDEO 素材库（点击添加到编辑器）
      </p>
      <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto">
        {items.map((mf) => (
          <Button
            key={mf.id}
            variant="outline"
            size="sm"
            className="flex h-auto items-start justify-start gap-2 p-2 text-left"
            disabled={adding === mf.id || (!!adding && adding !== mf.id)}
            onClick={() => handleAdd(mf)}
          >
            {adding === mf.id ? (
              <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
            ) : mf.type === "video" ? (
              <Video className="mt-0.5 size-4 shrink-0" />
            ) : mf.type === "image" ? (
              <ImageIcon className="mt-0.5 size-4 shrink-0" />
            ) : (
              <Music className="mt-0.5 size-4 shrink-0" />
            )}
            <span className="line-clamp-2 break-all text-xs">{mf.name}</span>
            <Plus className="mt-0.5 ml-auto size-3 shrink-0 opacity-50" />
          </Button>
        ))}
      </div>
    </div>
  );
}

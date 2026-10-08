"use client";

import {
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
} from "@editor/components/ui/context-menu";
import { usePreviewViewport } from "@editor/components/editor/panels/preview/preview-viewport";
import { useEditor } from "@editor/hooks/use-editor";
import { usePreviewStore } from "@editor/stores/preview-store";
import { toast } from "sonner";

export function PreviewContextMenu({
	onToggleFullscreen,
	containerRef,
}: {
	onToggleFullscreen: () => void;
	containerRef: React.RefObject<HTMLElement | null>;
}) {
	const editor = useEditor();
	const viewport = usePreviewViewport();
	const { overlays, setOverlayVisibility } = usePreviewStore();

	const handleCopySnapshot = async () => {
		const result = await editor.renderer.copySnapshot();

		if (!result.success) {
			toast.error("复制截图失败", {
				description: result.error ?? "请重试",
			});
			return;
		}
	};

	const handleSaveSnapshot = async () => {
		const result = await editor.renderer.saveSnapshot();

		if (!result.success) {
			toast.error("保存截图失败", {
				description: result.error ?? "请重试",
			});
			return;
		}
	};

	return (
		<ContextMenuContent className="w-56" container={containerRef.current}>
			<ContextMenuItem onClick={viewport.fitToScreen} inset>
				适应屏幕
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem onClick={onToggleFullscreen} inset>
				全屏
			</ContextMenuItem>
			<ContextMenuItem onClick={handleSaveSnapshot} inset>
				保存截图
			</ContextMenuItem>
			<ContextMenuItem onClick={handleCopySnapshot} inset>
				复制截图
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuCheckboxItem
				checked={overlays.bookmarks}
				onCheckedChange={(checked) =>
					setOverlayVisibility({ overlay: "bookmarks", isVisible: !!checked })
				}
			>
				显示书签备注
			</ContextMenuCheckboxItem>
		</ContextMenuContent>
	);
}

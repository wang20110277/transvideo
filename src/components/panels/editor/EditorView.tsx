// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { Loader2 } from "lucide-react";

/**
 * EditorView - 「剪辑」面板骨架
 * Task 7 接入 OpenCut 编辑器完整实现，当前仅占位
 */
export function EditorView() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Loader2 className="animate-spin" />
    </div>
  );
}

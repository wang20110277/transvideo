// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useMediaPanelStore } from "@/stores/media-panel-store";
import { editorRouter } from "@editor/shims/navigation";
import type { EditorCore } from "@editor/core";

const OpenCutEditor = lazy(() =>
  import("@editor/components/OpenCutEditor").then((m) => ({ default: m.OpenCutEditor })),
);

const LAST_PROJECT_KEY = "transvideo-editor-last-project";

function Loading({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3">
      <Loader2 className="animate-spin size-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function EditorView() {
  const setActiveTab = useMediaPanelStore((s) => s.setActiveTab);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"booting" | "ready" | "error">("booting");
  // 动态拿 EditorCore 的 promise（卸载时 best-effort 保存）
  const coreRef = useRef<Promise<{ EditorCore: typeof EditorCore }> | null>(null);
  const getCore = () =>
    (coreRef.current ??= import("@editor/core") as Promise<{ EditorCore: typeof EditorCore }>);

  // 启动：打开上次项目，没有则新建
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { EditorCore } = await getCore();
        EditorCore.getInstance(); // 触发单例初始化（注册 effects/masks、启动自动保存）
        let id = localStorage.getItem(LAST_PROJECT_KEY);
        if (!id) {
          id = await EditorCore.getInstance().project.createNewProject({ name: "未命名项目" });
          localStorage.setItem(LAST_PROJECT_KEY, id);
        }
        if (cancelled) return;
        editorRouter.setProjectId(id);
        setProjectId(id);
        setPhase("ready");
      } catch (err) {
        console.error("Editor boot failed:", err);
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 装配导航 shim
  useEffect(() => {
    editorRouter.setNavigateFn((path) => {
      if (path.startsWith("/editor/")) {
        const id = path.slice("/editor/".length);
        localStorage.setItem(LAST_PROJECT_KEY, id);
        editorRouter.setProjectId(id);
        setProjectId(id);
      } else {
        // /projects、/ 等一律退出编辑器
        localStorage.removeItem(LAST_PROJECT_KEY);
        editorRouter.setProjectId(null);
        setProjectId(null);
        setActiveTab("dashboard");
      }
    });
    return () => editorRouter.setNavigateFn(null);
  }, [setActiveTab]);

  // 卸载：best-effort 保存并关闭项目（SaveManager 有周期自动保存兜底）
  useEffect(() => {
    return () => {
      coreRef.current?.then(({ EditorCore }) => {
        try {
          const p = EditorCore.getInstance().project;
          void p.prepareExit();
          p.closeProject();
        } catch {
          /* 项目可能本就未打开 */
        }
      });
    };
  }, []);

  if (phase === "error") {
    return <Loading label="编辑器启动失败，请查看控制台日志" />;
  }
  if (phase === "booting" || !projectId) {
    return <Loading label="正在启动编辑器…" />;
  }
  return (
    <Suspense fallback={<Loading label="正在加载编辑器界面…" />}>
      <OpenCutEditor projectId={projectId} />
    </Suspense>
  );
}

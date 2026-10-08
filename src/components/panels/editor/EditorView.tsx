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

// 「读上次项目，没有则新建」的模块级单例 promise：dev StrictMode 双挂载时两个
// effect 共享同一次 createNewProject，避免双跑留孤儿项目。显式退出编辑器时置空
// （last-project 已清除，下次进入需新建）；失败时也置空以允许重试。
let bootProjectPromise: Promise<string> | null = null;

// 挂载代号：dev StrictMode 双挂载时，mount#1 的卸载收尾（异步链）可能晚于
// mount#2 的启动执行，save.stop()/closeProject() 会杀掉新挂载正依赖的订阅与
// 活动项目（实测症状：subs=0 后一切时间线编辑永不落盘、编辑中元素凭空消失）。
// 每次挂载递增；卸载链执行时若发现已有更新挂载接管，则放弃破坏性收尾。
let mountGeneration = 0;

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

  // 启动：打开上次项目，没有则新建（bootProjectPromise 防重，见其声明处注释）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { EditorCore } = await getCore();
        const core = EditorCore.getInstance(); // 触发单例初始化（注册 effects/masks、启动自动保存）
        core.save.start(); // 幂等：单例已存在时构造器不会重跑；上次卸载 stop 过则在此重挂订阅
        const id = await (bootProjectPromise ??= (async () => {
          let id = localStorage.getItem(LAST_PROJECT_KEY);
          if (!id) {
            id = await core.project.createNewProject({ name: "未命名项目" });
            localStorage.setItem(LAST_PROJECT_KEY, id);
          }
          return id;
        })().catch((err: unknown) => {
          bootProjectPromise = null; // 失败允许下次进入重试
          throw err;
        }));
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
        bootProjectPromise = null; // 下次进入重新解析（last-project 已清除，将新建项目）
        editorRouter.setProjectId(null);
        setProjectId(null);
        setActiveTab("dashboard");
      }
    });
    return () => editorRouter.setNavigateFn(null);
  }, [setActiveTab]);

  // 卸载：best-effort 保存后再关闭。顺序不可倒置——必须等 prepareExit（缩略图渲染
  // + save.flush）完成后才 closeProject：close 会同步置 active=null，若先跑，updateThumbnail
  // 撞 `if (!this.active) return`、flush 落空，编辑丢失。SaveManager 无周期定时器，只有
  // 变更驱动的 markDirty + 800ms debounce（save-manager.ts），故：
  //   1. 先显式 flush() 把 debounce 窗口内的未落盘编辑落盘（prepareExit 仅在缩略图
  //      有更新时才 flush，不覆盖纯属性编辑的场景）；
  //   2. closeProject 内的 clearScenes 会触发 markDirty 排入新的 debounce 定时器，其
  //      saveNow 在无 active 时于 try 外抛错（unhandled rejection），故 close 后再
  //      save.stop()（清定时器 + 退订）根治；重进时由启动 effect 幂等 save.start() 恢复。
  useEffect(() => {
    const generation = ++mountGeneration;
    return () => {
      coreRef.current?.then(({ EditorCore }) => {
        // 已有更新挂载接管（StrictMode 双挂载 / 快速重进）：放弃破坏性收尾，
        // 否则会关闭新挂载正在使用的项目并杀掉其保存订阅。
        if (generation !== mountGeneration) return;
        try {
          const core = EditorCore.getInstance();
          void core.save
            .flush()
            .catch(() => {})
            .then(() => core.project.prepareExit())
            .catch(() => {})
            .finally(() => {
              if (generation !== mountGeneration) return; // 链上各步再校验一次
              core.project.closeProject();
              core.save.stop();
            });
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

import { create } from "zustand";

type NavigateFn = (path: string) => void;

interface RouterShimState {
  projectId: string | null;
  navigateFn: NavigateFn | null;
}

export const useRouterShimStore = create<RouterShimState>(() => ({
  projectId: null,
  navigateFn: null,
}));

type Router = {
  push: (path: string) => void;
  replace: (path: string) => void;
  back: () => void;
};

let cachedRouter: Router | null = null;

/**
 * 稳定引用的 router shim：返回对象恒为同一引用。editor-provider 的 effect 以
 * [projectId, router] 为 deps，若每次渲染返回新字面量对象，任意重渲染（如自动保存
 * 更换 active 对象身份）都会令 loadProject 整轮重跑（闪 reload）。方法内经
 * getState() 调用时取最新 navigateFn，无闭包过期问题。
 */
export function useRouter(): Router {
  if (!cachedRouter) {
    cachedRouter = {
      push: (path) => useRouterShimStore.getState().navigateFn?.(path),
      replace: (path) => useRouterShimStore.getState().navigateFn?.(path),
      back: () => useRouterShimStore.getState().navigateFn?.("/projects"),
    };
  }
  return cachedRouter;
}

export function useParams(): { project_id?: string } {
  const projectId = useRouterShimStore((s) => s.projectId);
  return projectId ? { project_id: projectId } : {};
}

/** 宿主装配入口（非 hook）。EditorView 在挂载时调用。 */
export const editorRouter = {
  setProjectId(projectId: string | null) {
    useRouterShimStore.getState().projectId !== projectId &&
      useRouterShimStore.setState({ projectId });
  },
  setNavigateFn(navigateFn: NavigateFn | null) {
    useRouterShimStore.setState({ navigateFn });
  },
};

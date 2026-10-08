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

export function useRouter() {
  const navigateFn = useRouterShimStore((s) => s.navigateFn);
  return {
    push: (path: string) => navigateFn?.(path),
    replace: (path: string) => navigateFn?.(path),
    back: () => navigateFn?.("/projects"),
  };
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

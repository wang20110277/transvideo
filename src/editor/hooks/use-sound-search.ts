// 在线音效搜索依赖 OpenCut 的 /api/sounds/search（未迁移）。
// transvideo 版仅保留本地收藏功能，搜索返回空结果。
import type { SoundEffect } from "@editor/lib/sounds/types";

export function useSoundSearch(_params: {
	query: string;
	commercialOnly: boolean;
}) {
	const loadMore = async () => {};

	return {
		results: [] as SoundEffect[],
		isLoading: false,
		error: null as string | null,
		loadMore,
		hasNextPage: false,
		isLoadingMore: false,
		totalCount: 0,
	};
}

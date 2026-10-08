/* eslint-disable react-refresh/only-export-components -- 上游快照：组件与常量/工具同文件导出（仅影响 dev HMR 粒度，无运行时影响） */
import type { GuideDefinition } from "@editor/lib/guides/types";
import { gridGuide } from "./definitions/grid";
// import { customGuide } from "./definitions/custom";
import {
	tiktokGuide,
	igReelsGuide,
	ytShortsGuide,
	spotlightGuide,
} from "./definitions/platforms";

export type { GuideDefinition, GuideRenderProps } from "@editor/lib/guides/types";

export const GUIDE_REGISTRY = [
	gridGuide,
	tiktokGuide,
	igReelsGuide,
	ytShortsGuide,
	spotlightGuide,

	// todo: wire up custom guide fully, then uncomment this:
	// customGuide,
] as const satisfies readonly GuideDefinition[];

export type GuideId = (typeof GUIDE_REGISTRY)[number]["id"];

export function isGuideId(value: string): value is GuideId {
	return GUIDE_REGISTRY.some((guide) => guide.id === value);
}

/* eslint-disable react-refresh/only-export-components -- 宿主桥扩展点：注册函数与占位组件同文件是本模块的设计（仅影响 dev HMR 粒度，无运行时影响） */
import { useEffect, useState, type ReactNode } from "react";

let hostAssetsSection: ReactNode = null;
const listeners = new Set<() => void>();

/** 宿主注册要显示在编辑器素材面板顶部的区块（如 TRANSVIDEO 素材库） */
export function registerHostAssetsSection(node: ReactNode) {
	hostAssetsSection = node;
	listeners.forEach((l) => l());
}

export function HostAssetsSection() {
	const [, force] = useState(0);
	useEffect(() => {
		const l = () => force((n) => n + 1);
		listeners.add(l);
		return () => {
			listeners.delete(l);
		};
	}, []);
	return <>{hostAssetsSection}</>;
}

/** 宿主注册的「导出后添加字幕」处理器:落盘导出成片并跳转字幕板块;返回是否成功 */
export type SubtitleHandoffHandler = (buffer: ArrayBuffer, filename: string) => Promise<boolean>;

let subtitleHandoff: SubtitleHandoffHandler | null = null;

/** 宿主注册字幕交接处理器(编辑器树不直接依赖宿主 store;null = 注销) */
export function registerSubtitleHandoff(handler: SubtitleHandoffHandler | null) {
	subtitleHandoff = handler;
}

/** 是否已有宿主处理器(导出弹层据此显示「添加字幕」入口) */
export function hasSubtitleHandoff(): boolean {
	return subtitleHandoff !== null;
}

/** 触发字幕交接:未注册或 handler 抛错返回 false */
export async function invokeSubtitleHandoff(
	buffer: ArrayBuffer,
	filename: string,
): Promise<boolean> {
	if (!subtitleHandoff) return false;
	try {
		return await subtitleHandoff(buffer, filename);
	} catch {
		return false;
	}
}

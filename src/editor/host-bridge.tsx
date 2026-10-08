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

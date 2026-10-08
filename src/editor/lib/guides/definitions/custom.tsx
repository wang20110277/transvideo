/* eslint-disable react-refresh/only-export-components -- 上游快照：组件与常量/工具同文件导出（仅影响 dev HMR 粒度，无运行时影响） */
import { PlusSignIcon, RulerIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@editor/components/ui/button";
import type { GuideDefinition } from "@editor/lib/guides/types";

function CustomGuideOptions() {
	return (
		<div className="flex gap-2">
			<Button variant="outline" size="sm" className="flex-1">
				<HugeiconsIcon icon={PlusSignIcon} />
				添加参考线
			</Button>
		</div>
	);
}

export const customGuide = {
	id: "custom",
	label: "自定义",
	renderPreview: () => <HugeiconsIcon size={16} icon={RulerIcon} />,
	renderTriggerIcon: () => <HugeiconsIcon icon={RulerIcon} />,
	renderOverlay: () => null,
	renderOptions: () => <CustomGuideOptions />,
} as const satisfies GuideDefinition;

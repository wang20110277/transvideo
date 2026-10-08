import { useEditor } from "@editor/hooks/use-editor";
import { clamp } from "@editor/utils/math";
import { NumberField } from "@editor/components/ui/number-field";
import { OcCheckerboardIcon } from "@editor/brand-icons";
import { Fragment, useRef } from "react";
import { useMenuPreview } from "@editor/hooks/use-menu-preview";
import {
	Section,
	SectionContent,
	SectionField,
	SectionHeader,
	SectionTitle,
} from "@editor/components/section";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@editor/components/ui/select";
import type { BlendMode } from "@editor/lib/rendering";
import type { ElementType } from "@editor/lib/timeline";
import type { ElementAnimations } from "@editor/lib/animation/types";
import { HugeiconsIcon } from "@hugeicons/react";
import { RainDropIcon } from "@hugeicons/core-free-icons";
import { KeyframeToggle } from "../components/keyframe-toggle";
import { useKeyframedNumberProperty } from "../hooks/use-keyframed-number-property";
import { useElementPlayhead } from "../hooks/use-element-playhead";
import { resolveOpacityAtTime } from "@editor/lib/animation";
import { DEFAULTS } from "@editor/lib/timeline/defaults";
import { isPropertyAtDefault } from "./transform-tab";

type BlendingElement = {
	id: string;
	opacity: number;
	type: ElementType;
	blendMode?: BlendMode;
	startTime: number;
	duration: number;
	animations?: ElementAnimations;
};

const BLEND_MODE_GROUPS = [
	[{ value: "normal", label: "正常" }],
	[
		{ value: "darken", label: "变暗" },
		{ value: "multiply", label: "正片叠底" },
		{ value: "color-burn", label: "颜色加深" },
	],
	[
		{ value: "lighten", label: "变亮" },
		{ value: "screen", label: "滤色" },
		{ value: "plus-lighter", label: "线性减淡（添加）" },
		{ value: "color-dodge", label: "颜色减淡" },
	],
	[
		{ value: "overlay", label: "叠加" },
		{ value: "soft-light", label: "柔光" },
		{ value: "hard-light", label: "强光" },
	],
	[
		{ value: "difference", label: "差值" },
		{ value: "exclusion", label: "排除" },
	],
	[
		{ value: "hue", label: "色相" },
		{ value: "saturation", label: "饱和度" },
		{ value: "color", label: "颜色" },
		{ value: "luminosity", label: "明度" },
	],
];

export function BlendingTab({
	element,
	trackId,
}: {
	element: BlendingElement;
	trackId: string;
}) {
	const editor = useEditor();
	const isPreviewActive = useEditor((e) => e.timeline.isPreviewActive());
	const blendMode = element.blendMode ?? DEFAULTS.element.blendMode;
	const committedBlendModeRef = useRef(blendMode);
	if (!isPreviewActive) {
		committedBlendModeRef.current = blendMode;
	}

	const {
		onPointerLeave,
		onOpenChange: handleBlendModeOpenChange,
		markCommitted,
	} = useMenuPreview();

	const previewBlendMode = ({ value }: { value: BlendMode }) =>
		editor.timeline.previewElements({
			updates: [
				{ trackId, elementId: element.id, updates: { blendMode: value } },
			],
		});

	const commitBlendMode = (value: string) => {
		if (editor.timeline.isPreviewActive()) {
			editor.timeline.commitPreview();
		} else {
			editor.timeline.updateElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						updates: { blendMode: value as BlendMode },
					},
				],
			});
		}
		markCommitted();
	};

	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});
	const resolvedOpacity = resolveOpacityAtTime({
		baseOpacity: element.opacity,
		animations: element.animations,
		localTime,
	});

	const opacity = useKeyframedNumberProperty({
		trackId,
		elementId: element.id,
		animations: element.animations,
		propertyPath: "opacity",
		localTime,
		isPlayheadWithinElementRange,
		displayValue: Math.round(resolvedOpacity * 100).toString(),
		parse: (input) => {
			const parsed = parseFloat(input);
			if (Number.isNaN(parsed)) return null;
			return clamp({ value: parsed, min: 0, max: 100 }) / 100;
		},
		valueAtPlayhead: resolvedOpacity,
		step: 0.01,
		buildBaseUpdates: ({ value }) => ({ opacity: value }),
	});

	return (
		<Section collapsible sectionKey={`${element.id}:blending`}>
			<SectionHeader>
				<SectionTitle>混合</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<div className="flex items-start gap-2">
					<SectionField
						label="不透明度"
						className="w-1/2"
						beforeLabel={
							<KeyframeToggle
								isActive={opacity.isKeyframedAtTime}
								isDisabled={!isPlayheadWithinElementRange}
								title="切换不透明度关键帧"
								onToggle={opacity.toggleKeyframe}
							/>
						}
					>
						<NumberField
							className="w-full"
							icon={
								<OcCheckerboardIcon className="size-3.5 text-muted-foreground" />
							}
							value={opacity.displayValue}
							min={0}
							max={100}
							onFocus={opacity.onFocus}
							onChange={opacity.onChange}
							onBlur={opacity.onBlur}
							onScrub={opacity.scrubTo}
							onScrubEnd={opacity.commitScrub}
							onReset={() =>
								opacity.commitValue({ value: DEFAULTS.element.opacity })
							}
							isDefault={isPropertyAtDefault({
								hasAnimatedKeyframes: opacity.hasAnimatedKeyframes,
								isPlayheadWithinElementRange,
								resolvedValue: resolvedOpacity,
								staticValue: element.opacity,
								defaultValue: DEFAULTS.element.opacity,
							})}
							dragSensitivity="slow"
						/>
					</SectionField>
					<SectionField label="混合模式" className="w-1/2">
						<Select
							value={committedBlendModeRef.current}
							onOpenChange={handleBlendModeOpenChange}
							onValueChange={commitBlendMode}
						>
							<SelectTrigger
								icon={<HugeiconsIcon icon={RainDropIcon} />}
								className="w-full"
							>
								<SelectValue placeholder="选择混合模式" />
							</SelectTrigger>
							<SelectContent className="w-36" onPointerLeave={onPointerLeave}>
								{BLEND_MODE_GROUPS.map((group, groupIndex) => (
									<Fragment key={group[0]?.value ?? `group-${groupIndex}`}>
										{group.map((option) => (
											<SelectItem
												key={option.value}
												value={option.value}
												onPointerEnter={() =>
													previewBlendMode({ value: option.value as BlendMode })
												}
											>
												{option.label}
											</SelectItem>
										))}
										{groupIndex < BLEND_MODE_GROUPS.length - 1 ? (
											<SelectSeparator />
										) : null}
									</Fragment>
								))}
							</SelectContent>
						</Select>
					</SectionField>
				</div>
			</SectionContent>
		</Section>
	);
}

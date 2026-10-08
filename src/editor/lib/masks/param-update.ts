import { FEATHER_HANDLE_SCALE, MAX_FEATHER } from "@editor/constants/mask-constants";
import { masksRegistry } from "@editor/lib/masks";
import type { ParamValues } from "@editor/lib/params";
import type {
	BaseMaskParams,
	MaskParamUpdateArgs,
	MaskType,
} from "@editor/lib/masks/types";

function compactMaskParamValues({
	params,
}: {
	params: Partial<ParamValues>;
}): ParamValues {
	const nextParams: ParamValues = {};
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined) {
			nextParams[key] = value;
		}
	}
	return nextParams;
}

export function computeFeatherUpdate({
	startFeather,
	deltaX,
	deltaY,
	directionX,
	directionY,
}: {
	startFeather: number;
	deltaX: number;
	deltaY: number;
	directionX: number;
	directionY: number;
}): ParamValues {
	const projection = deltaX * directionX + deltaY * directionY;
	return {
		feather: Math.max(
			0,
			Math.min(
				MAX_FEATHER,
				Math.round(startFeather + projection / FEATHER_HANDLE_SCALE),
			),
		),
	};
}

export function computeMaskParamUpdate({
	maskType,
	...args
}: {
	maskType: MaskType;
} & MaskParamUpdateArgs<BaseMaskParams & ParamValues>): ParamValues {
	const definition = masksRegistry.get(maskType);
	return compactMaskParamValues({
		params: definition.computeParamUpdate(args),
	});
}

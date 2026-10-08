import type { RetimeConfig } from "@editor/lib/timeline";
import { clampRetimeRate } from "@editor/constants/retime-constants";

export function buildConstantRetime({
	rate,
	maintainPitch = false,
}: {
	rate: number;
	maintainPitch?: boolean;
}): RetimeConfig {
	return { rate: clampRetimeRate({ rate }), maintainPitch };
}

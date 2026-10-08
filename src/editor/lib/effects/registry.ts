import { DefinitionRegistry } from "@editor/lib/registry";
import type { EffectDefinition } from "@editor/lib/effects/types";

export class EffectsRegistry extends DefinitionRegistry<string, EffectDefinition> {
	constructor() {
		super("effect");
	}
}

export const effectsRegistry = new EffectsRegistry();

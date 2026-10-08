import type { StickerProvider } from "@editor/lib/stickers/types";
import { DefinitionRegistry } from "@editor/lib/registry";

export class StickersRegistry extends DefinitionRegistry<string, StickerProvider> {
	constructor() {
		super("sticker provider");
	}
}

export const stickersRegistry = new StickersRegistry();

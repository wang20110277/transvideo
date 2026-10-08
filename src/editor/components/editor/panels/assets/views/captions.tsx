import { Button } from "@editor/components/ui/button";
import { PanelView } from "@editor/components/editor/panels/assets/views/base-panel";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@editor/components/ui/select";
import { useState, useRef } from "react";
import { extractTimelineAudio } from "@editor/lib/media/mediabunny";
import { useEditor } from "@editor/hooks/use-editor";
import {
	BatchCommand,
	AddTrackCommand,
	InsertElementCommand,
} from "@editor/lib/commands";
import { TRANSCRIPTION_LANGUAGES } from "@editor/constants/transcription-constants";
import type {
	TranscriptionLanguage,
	TranscriptionProgress,
} from "@editor/lib/transcription/types";
import { transcriptionService } from "@editor/services/transcription/service";
import { decodeAudioToFloat32 } from "@editor/lib/media/audio";
import { buildCaptionChunks } from "@editor/lib/transcription/caption";
import { Spinner } from "@editor/components/ui/spinner";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
} from "@editor/components/section";
import { DEFAULTS } from "@editor/lib/timeline/defaults";

export function Captions() {
	const [selectedLanguage, setSelectedLanguage] =
		useState<TranscriptionLanguage>("auto");
	const [isProcessing, setIsProcessing] = useState(false);
	const [processingStep, setProcessingStep] = useState("");
	const [error, setError] = useState<string | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const editor = useEditor();

	const handleProgress = (progress: TranscriptionProgress) => {
		if (progress.status === "loading-model") {
			setProcessingStep(`正在加载模型 ${Math.round(progress.progress)}%`);
		} else if (progress.status === "transcribing") {
			setProcessingStep("正在转写…");
		}
	};

	const handleGenerateTranscript = async () => {
		try {
			setIsProcessing(true);
			setError(null);
			setProcessingStep("正在提取音频…");

			const audioBlob = await extractTimelineAudio({
				tracks: editor.timeline.getTracks(),
				mediaAssets: editor.media.getAssets(),
				totalDuration: editor.timeline.getTotalDuration(),
			});

			setProcessingStep("正在准备音频…");
			const { samples } = await decodeAudioToFloat32({ audioBlob });

			const result = await transcriptionService.transcribe({
				audioData: samples,
				language: selectedLanguage === "auto" ? undefined : selectedLanguage,
				onProgress: handleProgress,
			});

			setProcessingStep("正在生成字幕…");
			const captionChunks = buildCaptionChunks({ segments: result.segments });

			const addTrackCommand = new AddTrackCommand("text", 0);
			const insertCommands = captionChunks.map(
				(caption, i) =>
					new InsertElementCommand({
						placement: {
							mode: "explicit",
							trackId: addTrackCommand.getTrackId(),
						},
						element: {
							...DEFAULTS.text.element,
							name: `字幕 ${i + 1}`,
							content: caption.text,
							duration: caption.duration,
							startTime: caption.startTime,
							fontSize: 65,
							fontWeight: "bold",
						},
					}),
			);

			editor.command.execute({
				command: new BatchCommand([addTrackCommand, ...insertCommands]),
			});
		} catch (error) {
			console.error("Transcription failed:", error);
			setError(
				error instanceof Error ? error.message : "发生意外错误",
			);
		} finally {
			setIsProcessing(false);
			setProcessingStep("");
		}
	};

	const handleLanguageChange = ({ value }: { value: string }) => {
		if (value === "auto") {
			setSelectedLanguage("auto");
			return;
		}

		const matchedLanguage = TRANSCRIPTION_LANGUAGES.find(
			(language) => language.code === value,
		);
		if (!matchedLanguage) return;
		setSelectedLanguage(matchedLanguage.code);
	};

	return (
		<PanelView
			title="字幕"
			contentClassName="px-0 flex flex-col h-full"
			ref={containerRef}
		>
			<Section showTopBorder={false} showBottomBorder={false} className="flex-1">
				<SectionContent className="flex flex-col gap-4 h-full pt-1">
					<SectionFields>
						<SectionField label="语言">
							<Select
								value={selectedLanguage}
								onValueChange={(value) => handleLanguageChange({ value })}
							>
								<SelectTrigger>
									<SelectValue placeholder="选择语言" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="auto">自动检测</SelectItem>
									{TRANSCRIPTION_LANGUAGES.map((language) => (
										<SelectItem key={language.code} value={language.code}>
											{language.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SectionField>
					</SectionFields>

					{error && (
						<div className="bg-destructive/10 border-destructive/20 rounded-md border p-3">
							<p className="text-destructive text-sm">{error}</p>
						</div>
					)}
				</SectionContent>
			</Section>
			<Section showBottomBorder={false} showTopBorder={false}>
				<SectionContent>
					<Button
						className="w-full"
						onClick={handleGenerateTranscript}
						disabled={isProcessing}
					>
						{isProcessing && <Spinner className="mr-1" />}
						{isProcessing ? processingStep : "生成转写"}
					</Button>
				</SectionContent>
			</Section>
		</PanelView>
	);
}

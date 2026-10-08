import {
	ResizablePanelGroup,
	ResizablePanel,
	ResizableHandle,
} from "@editor/components/ui/resizable";
import { AssetsPanel } from "@editor/components/editor/panels/assets";
import { PropertiesPanel } from "@editor/components/editor/panels/properties";
import { Timeline } from "@editor/components/editor/panels/timeline";
import { PreviewPanel } from "@editor/components/editor/panels/preview";
import { EditorHeader } from "@editor/components/editor/editor-header";
import { EditorProvider } from "@editor/components/providers/editor-provider";
import { Onboarding } from "@editor/components/editor/onboarding";
import { MigrationDialog } from "@editor/components/editor/dialogs/migration-dialog";
import { TooltipProvider } from "@editor/components/ui/tooltip";
import { usePanelStore } from "@editor/stores/panel-store";
import { usePasteMedia } from "@editor/hooks/use-paste-media";

/**
 * 编辑器入口（由上游 app/editor/[project_id]/page.tsx 改造）：
 * - MobileGate 不迁移（桌面端宿主）
 * - h-screen w-screen 改为 h-full w-full（由宿主「剪辑」面板提供尺寸）
 * - 根元素挂 .opencut-scope：编辑器内启用 OpenCut 紧凑字号作用域（见 src/index.css）
 */
export function OpenCutEditor({ projectId }: { projectId: string }) {
	return (
		<EditorProvider projectId={projectId}>
			{/* radix-ui 1.4.3 的 Tooltip.Root 强制要求 Provider 祖先，否则 render 期抛
			    “`Tooltip` must be used within `TooltipProvider`”并炸掉整棵 React 树。
			    上游 OpenCut 在其 app layout 层包裹，迁移时缺失——在此补回。 */}
			<TooltipProvider>
				<div className="opencut-scope bg-background flex h-full w-full flex-col overflow-hidden">
					<EditorHeader />
					<div className="min-h-0 min-w-0 flex-1">
						<EditorLayout />
					</div>
					<Onboarding />
					<MigrationDialog />
				</div>
			</TooltipProvider>
		</EditorProvider>
	);
}

function EditorLayout() {
	usePasteMedia();
	const { panels, setPanel } = usePanelStore();

	return (
		<ResizablePanelGroup
			direction="vertical"
			className="size-full gap-[0.18rem]"
			onLayout={(sizes) => {
				setPanel("mainContent", sizes[0] ?? panels.mainContent);
				setPanel("timeline", sizes[1] ?? panels.timeline);
			}}
		>
			<ResizablePanel
				defaultSize={panels.mainContent}
				minSize={30}
				maxSize={85}
				className="min-h-0"
			>
				<ResizablePanelGroup
					direction="horizontal"
					className="size-full gap-[0.19rem] px-3"
					onLayout={(sizes) => {
						setPanel("tools", sizes[0] ?? panels.tools);
						setPanel("preview", sizes[1] ?? panels.preview);
						setPanel("properties", sizes[2] ?? panels.properties);
					}}
				>
					<ResizablePanel
						defaultSize={panels.tools}
						minSize={15}
						maxSize={40}
						className="min-w-0"
					>
						<AssetsPanel />
					</ResizablePanel>

					<ResizableHandle />

					<ResizablePanel
						defaultSize={panels.preview}
						minSize={30}
						className="min-h-0 min-w-0 flex-1"
					>
						<PreviewPanel />
					</ResizablePanel>

					<ResizableHandle />

					<ResizablePanel
						defaultSize={panels.properties}
						minSize={15}
						maxSize={40}
						className="min-w-0"
					>
						<PropertiesPanel />
					</ResizablePanel>
				</ResizablePanelGroup>
			</ResizablePanel>

			<ResizableHandle />

			<ResizablePanel
				defaultSize={panels.timeline}
				minSize={15}
				maxSize={70}
				className="min-h-0 px-3 pb-3"
			>
				<Timeline />
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}

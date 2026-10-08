"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@editor/components/ui/dialog";
import { useEditor } from "@editor/hooks/use-editor";
import { Loader2 } from "lucide-react";

export function MigrationDialog() {
	const editor = useEditor();
	const migrationState = editor.project.getMigrationState();

	if (!migrationState.isMigrating) return null;

	const title = "正在更新项目";
	const description = migrationState.projectName
		? `正在将 “${migrationState.projectName}” 从 v${migrationState.fromVersion} 升级到 v${migrationState.toVersion}`
		: `正在将项目从 v${migrationState.fromVersion} 升级到 v${migrationState.toVersion}`;

	return (
		<Dialog open={true}>
			<DialogContent
				className="sm:max-w-md"
				onPointerDownOutside={(event) => event.preventDefault()}
				onEscapeKeyDown={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				<div className="flex items-center justify-center py-4">
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
				</div>
			</DialogContent>
		</Dialog>
	);
}

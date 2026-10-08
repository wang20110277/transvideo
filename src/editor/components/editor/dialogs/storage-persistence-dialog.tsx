"use client";

import { Button } from "@editor/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@editor/components/ui/dialog";
import { useStoragePersistence } from "@editor/hooks/use-storage-persistence";

export function StoragePersistenceDialog() {
	const { showDialog, onConfirm, onDismiss } = useStoragePersistence();

	return (
		<Dialog open={showDialog} onOpenChange={(open) => !open && onDismiss()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>避免项目丢失</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<p className="text-base text-muted-foreground">
						当浏览器存储空间不足时，可能会自动删除你的项目。
					</p>
					<p className="text-base text-muted-foreground">
						允许 OpenCut 保护它们吗？
					</p>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={onDismiss}>
						暂不
					</Button>
					<Button onClick={onConfirm}>允许</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

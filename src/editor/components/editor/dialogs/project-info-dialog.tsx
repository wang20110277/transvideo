import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@editor/components/ui/dialog";
import type { TProjectMetadata } from "@editor/lib/project/types";
import { formatDate } from "@editor/utils/date";
import { formatTimeCode } from "@editor/lib/time";
import { Button } from "@editor/components/ui/button";

function InfoRow({
	label,
	value,
}: {
	label: string;
	value: string | React.ReactNode;
}) {
	return (
		<div className="flex justify-between items-center py-0 last:pb-0">
			<span className="text-muted-foreground text-sm">{label}</span>
			<span className="text-sm font-medium">{value}</span>
		</div>
	);
}

export function ProjectInfoDialog({
	isOpen,
	onOpenChange,
	project,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	project: TProjectMetadata;
}) {
	const durationFormatted =
		project.duration > 0
			? formatTimeCode({
					timeInSeconds: project.duration,
					format: project.duration >= 3600 ? "HH:MM:SS" : "MM:SS",
				})
			: "0:00";

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent onOpenAutoFocus={(event) => event.preventDefault()}>
				<DialogHeader>
					<DialogTitle className="truncate max-w-[350px]">
						{project.name}
					</DialogTitle>
				</DialogHeader>

				<DialogBody className="flex flex-col">
					<InfoRow label="时长" value={durationFormatted} />
					<InfoRow
						label="创建时间"
						value={formatDate({ date: project.createdAt })}
					/>
					<InfoRow
						label="修改时间"
						value={formatDate({ date: project.updatedAt })}
					/>
					<InfoRow
						label="项目 ID"
						value={
							<code className="text-xs bg-muted px-1.5 py-0.5 rounded">
								{project.id.slice(0, 8)}
							</code>
						}
					/>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						关闭
					</Button>
					<Button onClick={() => onOpenChange(false)}>完成</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

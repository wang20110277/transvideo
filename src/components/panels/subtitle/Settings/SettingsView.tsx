// 设置子页壳:左侧导航(模型管理/服务商配置/输出选项)+ 右侧内容区。
// 入口为板块头部的齿轮按钮(SubtitleStudioPanel 本地视图态切换,不经 store);
// 视图态在壳内自持(选中子页),卸载即丢——与向导同款非持久 UI 态。
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ModelsSettings } from "./ModelsSettings";
import { ProviderSettings } from "./ProviderSettings";
import { SubtitleSettings } from "./SubtitleSettings";

const SECTIONS = [
  { id: "models", label: "模型管理" },
  { id: "providers", label: "服务商配置" },
  { id: "output", label: "输出选项" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function SettingsView({ onExit }: { onExit: () => void }) {
  const [section, setSection] = useState<SectionId>("models");

  return (
    <div className="flex min-h-0 flex-1" data-subtitle-settings>
      <nav className="flex w-52 shrink-0 flex-col gap-1 border-r border-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className="mb-1 justify-start px-2 text-muted-foreground"
          onClick={onExit}
          data-settings-exit
        >
          <ArrowLeft className="h-4 w-4" />
          返回任务
        </Button>
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            data-settings-nav={item.id}
            className={cn(
              "rounded-md border border-transparent px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50",
              section === item.id && "border-border bg-muted font-medium",
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        <ScrollArea className="h-full">
          <div className="mx-auto flex max-w-3xl flex-col p-4">
            {section === "models" && <ModelsSettings />}
            {section === "providers" && <ProviderSettings />}
            {section === "output" && <SubtitleSettings />}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

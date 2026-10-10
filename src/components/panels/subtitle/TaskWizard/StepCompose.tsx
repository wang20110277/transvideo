// 向导第④步「合成与提交」:烧录开关 + 字幕样式(字体/字号/位置)。
// Task 9 裁定:树内无任务级输出目录字段(产物落源文件目录),故本步无输出目录 UI;
// 字体清单来自树内 subtitleMerge:listFonts 通道(平台已知字体 + 已安装字体族)。
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useSubtitleStudioStore } from "@/stores/subtitle-studio-store";
import { loadFontOptions, type FontOption } from "./wizard-data";

/** 位置选项:树内 SubtitleAlignment 九宫格,v1 只开放底部(2)/顶部(8) */
const POSITION_OPTIONS = [
  { value: 2, label: "底部" },
  { value: 8, label: "顶部" },
] as const;

const FONT_PLACEHOLDER = "__default__"; // Select 不允许空字符串 value,以哨兵代 ''(跟随系统默认)

export function StepCompose() {
  const options = useSubtitleStudioStore((s) => s.wizardOptions);
  const setOptions = useSubtitleStudioStore((s) => s.setOptions);
  const [fonts, setFonts] = useState<FontOption[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadFontOptions().then((list) => {
      if (!cancelled) setFonts(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const availableFonts = (fonts ?? []).filter((font) => font.available);

  return (
    <div className="flex flex-col gap-5 p-6">
      {/* 烧录开关 */}
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
        <div className="flex flex-col">
          <span className="text-sm font-medium">烧录字幕到视频</span>
          <span className="text-xs text-muted-foreground">
            关闭后仅导出字幕文件,不合成新视频;产物保存在源视频所在目录
          </span>
        </div>
        <Switch
          checked={options.burn}
          onCheckedChange={(checked) => setOptions({ burn: checked })}
        />
      </div>

      {/* 字幕样式(burn 开启时显示) */}
      {options.burn && (
        <>
          <div className="flex flex-col gap-2">
            <Label>字体</Label>
            {fonts === null ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                正在读取系统字体…
              </div>
            ) : availableFonts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                字体清单不可用,将使用系统默认字体
              </p>
            ) : (
              <Select
                value={options.burnStyle.fontName || FONT_PLACEHOLDER}
                onValueChange={(value) =>
                  setOptions({
                    burnStyle: {
                      ...options.burnStyle,
                      fontName: value === FONT_PLACEHOLDER ? "" : value,
                    },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择字体" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FONT_PLACEHOLDER}>跟随系统默认</SelectItem>
                  {availableFonts.map((font) => (
                    <SelectItem key={font.name} value={font.name}>
                      {font.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-end gap-4">
            <div className="flex w-32 flex-col gap-2">
              <Label>字号</Label>
              <Input
                type="number"
                min={10}
                max={72}
                value={options.burnStyle.fontSize}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) {
                    setOptions({
                      burnStyle: {
                        ...options.burnStyle,
                        // 夹在树内合理区间,空输入回落默认
                        fontSize: Math.min(72, Math.max(10, Math.round(next))) || 24,
                      },
                    });
                  }
                }}
              />
            </div>
            <div className="flex w-32 flex-col gap-2">
              <Label>位置</Label>
              <Select
                value={String(options.burnStyle.position)}
                onValueChange={(value) =>
                  setOptions({
                    burnStyle: {
                      ...options.burnStyle,
                      position: POSITION_OPTIONS.find((p) => String(p.value) === value)?.value ?? 2,
                    },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择位置" />
                </SelectTrigger>
                <SelectContent>
                  {POSITION_OPTIONS.map((position) => (
                    <SelectItem key={position.value} value={String(position.value)}>
                      {position.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        提交后任务进入左侧列表;内置引擎首次运行需下载模型,失败详情会显示在任务详情与日志中
      </p>
    </div>
  );
}

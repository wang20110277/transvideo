import { useThemeStore } from "@/stores/theme-store";

/** next-themes 替身：桥接 transvideo 的 theme-store（无 system 模式） */
export function useTheme() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  return {
    theme,
    resolvedTheme: theme,
    setTheme: (t: string) => {
      if (t === "light" || t === "dark") setTheme(t);
    },
  };
}

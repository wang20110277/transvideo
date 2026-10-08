import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: { environment: "node" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // 与 tsconfig.json paths 对齐：随迁编辑器测试经 @editor/* 导入
      "@editor": path.resolve(__dirname, "./src/editor"),
    },
  },
});

import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    // smartsub 移植树内 service/ 的 *.test.ts 为上游 jest 用例(jest.mock / @jest-environment),
    // 本仓库测试运行时为 vitest,不纳入收集;tsconfig 侧同样排除(见 electron/services/smartsub/tsconfig.json)。
    // bridge/__tests__ 为本仓库 vitest 用例,保持在收集范围内
    exclude: [...configDefaults.exclude, "electron/services/smartsub/service/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // 与 tsconfig.json paths 对齐：随迁编辑器测试经 @editor/* 导入
      "@editor": path.resolve(__dirname, "./src/editor"),
    },
  },
});

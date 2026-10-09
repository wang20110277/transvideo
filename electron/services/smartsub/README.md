# SmartSub 移植模块

- 来源: https://github.com/buxuku/SmartSub v3.9.0, commit a55e214
- 搬入: main/{helpers,service,translate,glossary} + types/ + automation/{handlers,events}.ts
- 结构: 镜像源仓库相对布局,内部相对导入不变
- 排除: assistant/、automation(MCP/server/jobs)、videoDownload/、toolbox/、
  proofread*(校对台)、窗口/菜单/更新器等宿主脚手架——完整清单见
  docs/superpowers/plans/2026-10-09-smartsub-migration-phase01.md
- 已知偏差: (本节由 Task 3/4 填写)
- 上游同步: diff 上游 main/ 对应模块 → 挑拣合入;合入后重跑
  npm test 与冒烟;bridge/ 不在上游,勿被 diff 带走

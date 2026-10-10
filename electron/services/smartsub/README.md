# SmartSub 移植模块

- 来源: https://github.com/buxuku/SmartSub v3.9.0, commit a55e214
- 搬入: main/{helpers,service,translate,glossary} + types/ + automation/{handlers,events}.ts
- 结构: 镜像源仓库相对布局,内部相对导入不变
- 排除: assistant/、automation(MCP/server/jobs)、videoDownload/、toolbox/、
  proofread*(校对台)、窗口/菜单/更新器等宿主脚手架——完整清单见
  docs/superpowers/plans/2026-10-09-smartsub-migration-phase01.md
- 已知偏差:
  1. helpers/smartsubPaths.ts + userData codemod:app.getPath('userData') → smartsubUserData()(34 处/26 文件,scripts/port-smartsub.mjs 自动完成;brief 预估 47,差额来自未搬运的 updater.ts 等)
  2. helpers/utils.ts getExtraResourcesPath:根改为 extraResources/smartsub(打包)/ resources(开发)
  3. 布局路径 codemod(161 文件):源仓库 types/ 与 renderer/lib/ 位于仓库根,main/ 子目录镜像为
     smartsub/ 直接子目录后,N≥2 级 '../' 攀升的 types/renderer 引用一律减一级
     (单级 '../types' 为 translate/types 等本地目录,保持不动)
  4. 断链补搬 14 个文件:helpers/buildInfo.ts、toolbox/{videoTrimmer,embeddedSubtitleExtractor,outputPath}.ts、
     videoDownload/{scheduler,pipeline,pipelineReadiness,engineAdapter,parsers,cookieProfileStore,cookies,ytDlpAdapter,luxAdapter}.ts、
     renderer/lib/fasterWhisperModels.json(数据/纯逻辑类,补搬清单详见 task-3 报告)
  5. helpers/menu.ts 为 no-op 桩(仅 rebuildAppMenu):上游文件为窗口/菜单类按计划排除,
     真实搬入会连带 appBranding 并在宿主内重建 transvideo 菜单;Task 4+ 视需要接通
  6. helpers/index.ts 桶文件未随搬:其 re-export 被排除的 create-window,且移植树内无消费方
  7. 编译隔离:根 tsconfig exclude 本树;本树 tsconfig.json 对齐上游 main 进程编译语义
     (strict:false、ES2022、esModuleInterop、无 lib.dom——主进程 fetch 走 Node/undici 类型,
     host-fetch-types.d.ts 补全局 BodyInit 别名);service/__tests__(jest 用例)不参与编译与 vitest 收集
  8. bridge/(Task 4 新增,不在上游):装配桥 index.ts 暴露 initSmartSubBridge() 与
     smartsubQuitGuard(),新增 IPC 通道 smartsub:init(懒装配,幂等)与
     smartsub:reveal-path(资源定位);宿主接线点 electron/main.ts 两处——whenReady 体内
     initSmartSubBridge()、顶层 before-quit 退出守卫(preventDefault → 守卫放行后 app.exit(0))
  9. 类型接缝(Task 4):根 tsconfig 若经 import 追入 index.ts 会把整树带进 strict 程序
     (exclude 只挡 include 根)。故根 tsconfig paths 将 '@smartsub/bridge' 解析到
     bridge/index.d.ts(declaration-only 门面,签名须与 index.ts 同步),electron-vite
     main 段 resolve.alias 将同一说明符解析回 index.ts 实现实体;main.ts 以
     '@smartsub/bridge' 导入。上游同步时若 bridge 导出签名变化,两处需同步改
  10. 签名适配(Task 4,宿主调用侧):树内 8 个 setup*(systemInfoManager/taskProcessor/
     glossary/subtitleMerge/pipeline/dubbing/voiceClone/ipcHandlers)必填 mainWindow,
     桥以 BrowserWindow.fromWebContents(event.sender) 取发起 smartsub:init 的宿主窗口代入;
     退出守卫运行中任务判定用 workItemStore.getWorkItems() 的 status∈{waiting,running}
     (树内无 getTaskProjects 导出;WorkItemStatus 六态见 types/workItem.ts)
  11. helpers/store/index.ts electron-store 实例化加 cwd: smartsubUserData()(spec §2
     强制要求的存储位置适配):配置落 userData/smartsub/config.json,与宿主 userData 根
     隔离(上游默认落 userData 根 config.json);configExporter 等均经同一实例,路径随之
- 上游同步: diff 上游 main/ 对应模块 → 挑拣合入;合入后重跑
  npm test 与冒烟;bridge/ 不在上游,勿被 diff 带走

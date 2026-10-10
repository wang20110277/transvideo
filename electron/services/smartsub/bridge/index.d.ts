// 根 tsconfig 的类型门面(declaration-only)。
// 背景:根程序若经 import 拉入 bridge/index.ts,会把整棵 smartsub 移植树带进
// strict 程序(exclude 只挡 include 根,挡不住 import 追入);树内代码归
// electron/services/smartsub/tsconfig.json(strict:false)单独编译。
// 因此根 tsconfig 以 paths 将 '@smartsub/bridge' 解析到本文件,electron-vite
// 以 resolve.alias 将同一说明符解析到 index.ts 实现实体。
// 注意:导出签名须与 index.ts 保持同步(仅两个函数)。
export declare function initSmartSubBridge(): void
export declare function smartsubQuitGuard(): Promise<boolean>

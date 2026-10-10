// 宿主类型补充(Task 3):smartsub 树 tsconfig 不含 lib.dom,主进程 fetch 走
// Node(undici)全局类型;上游 service/asr/gladia.ts 显式引用全局 BodyInit,
// 此处以 undici 语义补该全局别名。删除本文件会使 gladia.ts 两处 TS2304。
declare global {
  type BodyInit = import('undici-types').BodyInit;
}
export {};

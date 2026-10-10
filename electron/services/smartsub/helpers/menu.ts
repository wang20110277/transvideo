// bridge 桩(Task 3 落位):上游 main/helpers/menu.ts 为窗口/菜单类,按迁移计划不搬运。
// 宿主应用菜单由 transvideo 自管;SmartSub 语言切换触发的菜单重建在宿主内为 no-op。
// Task 4+ 若需 SmartSub 风格菜单,在此接通(参见 README 已知偏差)。
export function rebuildAppMenu(_language?: string): void {
  /* no-op by design */
}

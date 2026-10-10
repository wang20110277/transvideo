// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.

/**
 * 场景库拖拽排序的核心重排逻辑(纯函数,便于单测)。
 *
 * 显示顺序 = scenes 数组顺序(过滤/建树都保持数组相对序),故"重排"即"在全局
 * 数组内移动位置";树形展示按 parentSceneId 分组取子场景,不依赖全局连续性,
 * 所以根场景移到"末尾"时插在数组中最后一个同级之后、即使其后还跟着其他
 * 父场景的子场景,展示分组依然正确。
 *
 * 同级定义:相同 parentSceneId(含都为根)且相同 folderId。
 */
export function computeReorderedScenes<
  T extends { id: string; parentSceneId?: string; folderId?: string | null },
>(scenes: T[], sceneId: string, beforeSceneId: string | null): T[] {
  const sceneIndex = scenes.findIndex((s) => s.id === sceneId);
  if (sceneIndex === -1) return scenes;
  if (beforeSceneId === sceneId) return scenes;

  const scene = scenes[sceneIndex];
  const isSibling = (s: T) =>
    (s.parentSceneId ?? null) === (scene.parentSceneId ?? null) &&
    (s.folderId ?? null) === (scene.folderId ?? null);

  const rest = scenes.filter((s) => s.id !== sceneId);

  if (beforeSceneId !== null) {
    const targetIndex = rest.findIndex((s) => s.id === beforeSceneId);
    if (targetIndex === -1) return scenes; // 目标不存在:不动
    return [...rest.slice(0, targetIndex), scene, ...rest.slice(targetIndex)];
  }

  // null = 移到同级末尾:追加到数组中最后一个同级之后
  let lastSiblingIndex = -1;
  for (let i = rest.length - 1; i >= 0; i--) {
    if (isSibling(rest[i])) {
      lastSiblingIndex = i;
      break;
    }
  }
  if (lastSiblingIndex === -1) return scenes; // 无同级可依:不动
  return [
    ...rest.slice(0, lastSiblingIndex + 1),
    scene,
    ...rest.slice(lastSiblingIndex + 1),
  ];
}

/**
 * 拖拽落点映射:平铺展示树上的 source/dest 索引 → 应执行的重排动作。
 * 返回 null 表示不动(原位落回/落点无效/落在无关区域如其他父场景与子场景之间)。
 *
 * 索引语义(react-dnd 系约定):dest 是"移除被拖项后的列表"中的插入位——
 * 落点前/后行必须在移除后的列表上取;直接用原列表会在下拖时差一位
 * (症状:只能往上拖、往下拖不动或差一格)。
 *
 * 规则(不做跨父拖拽):
 * - 落点下一行是同级 → 移到该同级之前;
 * - 下一行非同级但上一行是同级 → "紧随其后"语义:移到上一行同级的下一个同级
 *   之前,没有则移到同级末尾(beforeSceneId=null)。
 */
export interface ReorderableRow {
  id: string;
  parentSceneId?: string;
  folderId?: string | null;
}

export function resolveSceneReorder(
  rows: ReorderableRow[],
  sourceIndex: number,
  destIndex: number,
): { sceneId: string; beforeSceneId: string | null } | null {
  if (sourceIndex === destIndex) return null;
  const dragged = rows[sourceIndex];
  if (!dragged) return null;

  const without = rows.filter((row) => row.id !== dragged.id);
  const isSibling = (row?: ReorderableRow) =>
    !!row &&
    (row.parentSceneId ?? null) === (dragged.parentSceneId ?? null) &&
    (row.folderId ?? null) === (dragged.folderId ?? null);

  const nextRow = without[destIndex];
  if (isSibling(nextRow)) {
    return { sceneId: dragged.id, beforeSceneId: nextRow.id };
  }

  const prevRow = without[destIndex - 1];
  if (isSibling(prevRow)) {
    for (let i = destIndex; i < without.length; i++) {
      if (isSibling(without[i])) {
        return { sceneId: dragged.id, beforeSceneId: without[i].id };
      }
    }
    return { sceneId: dragged.id, beforeSceneId: null };
  }

  return null;
}

import { describe, it, expect } from 'vitest';
import { computeReorderedScenes, resolveSceneReorder } from '@/lib/scene-reorder';

interface TestScene {
  id: string;
  parentSceneId?: string;
  folderId?: string | null;
}

const ids = (scenes: TestScene[]) => scenes.map((s) => s.id);

describe('computeReorderedScenes(场景库拖拽排序)', () => {
  it('把场景移到指定同级场景之前', () => {
    const scenes: TestScene[] = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    // C 拖到 A 前
    expect(ids(computeReorderedScenes(scenes, 'C', 'A'))).toEqual(['C', 'A', 'B']);
    // A 拖到 C 前(跨过一个同级)
    expect(ids(computeReorderedScenes(scenes, 'A', 'C'))).toEqual(['B', 'A', 'C']);
  });

  it('beforeSceneId=null 时移到同级末尾(不跨 folder/父级,子场景随父分组不受影响)', () => {
    // 树形交错数组:P1 的子场景夹在根场景之间
    const scenes: TestScene[] = [
      { id: 'P1' },
      { id: 'c1a', parentSceneId: 'P1' },
      { id: 'c1b', parentSceneId: 'P1' },
      { id: 'P2' },
      { id: 'c2a', parentSceneId: 'P2' },
    ];
    // P1 拖到根场景末尾:追加到数组中最后一个根场景(P2)之后
    expect(ids(computeReorderedScenes(scenes, 'P1', null))).toEqual([
      'c1a', 'c1b', 'P2', 'P1', 'c2a',
    ]);
  });

  it('同级末尾只匹配同 parentSceneId + folderId 的场景', () => {
    // A(f1) 的同级是 C(f1),不含 B(f2)
    const scenes: TestScene[] = [
      { id: 'A', folderId: 'f1' },
      { id: 'B', folderId: 'f2' },
      { id: 'C', folderId: 'f1' },
    ];
    expect(ids(computeReorderedScenes(scenes, 'A', null))).toEqual(['B', 'C', 'A']);

    // 子场景的唯一同级是同父的兄弟,不与根场景混排
    const tree: TestScene[] = [
      { id: 'P1' },
      { id: 'c1', parentSceneId: 'P1' },
      { id: 'P2' },
    ];
    expect(ids(computeReorderedScenes(tree, 'c1', null))).toEqual(['P1', 'c1', 'P2']);
  });

  it('无效输入原样返回(拖自身/目标不存在/场景不存在)', () => {
    const scenes: TestScene[] = [{ id: 'A' }, { id: 'B' }];
    expect(computeReorderedScenes(scenes, 'A', 'A')).toBe(scenes);
    expect(computeReorderedScenes(scenes, 'A', '不存在的目标')).toBe(scenes);
    expect(computeReorderedScenes(scenes, '不存在的场景', 'B')).toBe(scenes);
  });
});

describe('resolveSceneReorder(平铺树拖拽落点 → 重排动作映射)', () => {
  // 平铺行:A 根、a1 A 的子、B 根、C 根
  const rows: TestScene[] = [
    { id: 'A' },
    { id: 'a1', parentSceneId: 'A' },
    { id: 'B' },
    { id: 'C' },
  ];
  // 纯根三行(下移/上移基础用例)
  const abc: TestScene[] = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];

  it('下移一位:落在移除后的下一行之前(rbd dest 语义,修复"不能往下拖")', () => {
    // [A,B,C] A(0)→dest1,期望结果 [B,A,C]:移除 A 后列表 [B,C],插入位 1 的下一行是 C
    expect(resolveSceneReorder(abc, 0, 1)).toEqual({ sceneId: 'A', beforeSceneId: 'C' });
    expect(ids(computeReorderedScenes(abc, 'A', 'C'))).toEqual(['B', 'A', 'C']);
  });

  it('下移到末尾:同级末尾追加', () => {
    // [A,B,C] A(0)→dest2,期望 [B,C,A]
    expect(resolveSceneReorder(abc, 0, 2)).toEqual({ sceneId: 'A', beforeSceneId: null });
    expect(ids(computeReorderedScenes(abc, 'A', null))).toEqual(['B', 'C', 'A']);
  });

  it('上移一位/上移到顶:语义不受影响', () => {
    // [A,B,C] C(2)→dest1 期望 [A,C,B]
    expect(resolveSceneReorder(abc, 2, 1)).toEqual({ sceneId: 'C', beforeSceneId: 'B' });
    // [A,B,C] C(2)→dest0 期望 [C,A,B]
    expect(resolveSceneReorder(abc, 2, 0)).toEqual({ sceneId: 'C', beforeSceneId: 'A' });
  });

  it('树形:拖到树的末尾 → 同级末尾(动作可为 null,效果等价)', () => {
    // rows: A(0) 拖到整个列表末尾。4 项列表的最大落点是 dest=3(without 列表的最后一位)
    expect(resolveSceneReorder(rows, 0, 3)).toEqual({ sceneId: 'A', beforeSceneId: null });
  });

  it('树形:紧随其后语义(prevRow 同级 → 下一个同级前)', () => {
    // C(3) 拖到 A 与 a1 之间(dest=1):移除 C 后 [A,a1,B],prevRow=A 同级,其后第一个同级 B
    expect(resolveSceneReorder(rows, 3, 1)).toEqual({ sceneId: 'C', beforeSceneId: 'B' });
  });

  it('落在无关区域(前后都非同级)→ 不动', () => {
    // 子场景 a1 拖到根区域 B 与 C 之间:dest=2,移除 a1 后 prevRow=B nextRow=C 都是根
    const treeRows: TestScene[] = [{ id: 'A' }, { id: 'a1', parentSceneId: 'A' }, { id: 'B' }, { id: 'C' }];
    expect(resolveSceneReorder(treeRows, 1, 2)).toBeNull();
  });

  it('源位置无效或原位落回 → 不动', () => {
    expect(resolveSceneReorder(rows, 99, 1)).toBeNull();
    expect(resolveSceneReorder(rows, 2, 2)).toBeNull();
  });
});

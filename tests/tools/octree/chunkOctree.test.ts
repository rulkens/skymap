import { describe, expect, it } from 'vitest';

import type { OctreeNodeTable } from '../../../src/@types/octree/OctreeNodeTable';
import type { StratifiedOctree } from '../../../tools/@types/octree/StratifiedOctree';
import { NO_CHUNK_REF } from '../../../src/data/octree/octreeFormat';
import { chunkOctree } from '../../../tools/octree/chunkOctree';
import { stratifyOctree } from '../../../tools/octree/stratifyOctree';
import { makeOctreeBuildInput, randomOctreeRecords } from '../../fixtures/makeOctreeBuildInput';

const GRID = { bits: 6, origin: [0, 0, 0] as [number, number, number], cellEdge: 10 };
const CAPACITY = 300;

const key = (level: number, morton: number) => `${level}:${morton}`;
const recordsOf = (t: OctreeNodeTable, i: number) => t.ownCount[i]! + (t.childMask[i] ? 1 : 0);

/** Brute-force strict-descendant record count of every row of the stratified tree. */
function descendantRecords(tree: StratifiedOctree): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (row: number): number => {
    let below = 0;
    for (let o = 0; o < 8; o++) {
      const c = tree.childIndex[row * 8 + o]!;
      if (c >= 0) below += recordsOf(tree.nodes, c) + walk(c);
    }
    out.set(key(tree.nodes.level[row]!, tree.nodes.morton[row]!), below);
    return below;
  };
  walk(tree.nodes.count - 1);
  return out;
}

function fixtureTree(): StratifiedOctree {
  return stratifyOctree(makeOctreeBuildInput(randomOctreeRecords(2000, 3, 640, [-6, 14]), GRID));
}

describe('chunkOctree', () => {
  it('a chunk decodes without any other chunk', () => {
    const objects = chunkOctree(fixtureTree(), CAPACITY);
    expect(objects.chunks.length).toBeGreaterThan(3);
    for (const chunk of objects.chunks) {
      const t = chunk.nodes;
      const rows = new Set(Array.from(t.morton, (m, i) => key(t.level[i]!, m)));
      let records = 0;
      for (let i = 0; i < t.count; i++) {
        const parent = key(t.level[i]! + 1, t.morton[i]! >>> 3);
        expect(rows.has(parent) || parent === key(chunk.level, chunk.morton)).toBe(true);
        expect(t.morton[i]! >>> (3 * (chunk.level - t.level[i]!))).toBe(chunk.morton);
        expect(t.firstRecord[i]).toBe(records);
        records += recordsOf(t, i);
      }
      expect(chunk.columns.get('absMag')!.length).toBe(records);
      expect(chunk.columns.get('offset')!.length).toBe(3 * records);
    }
  });

  it('an over-capacity node stays in the index and the split recurses', () => {
    const tree = fixtureTree();
    const below = descendantRecords(tree);
    const { index, chunks } = chunkOctree(tree, CAPACITY);
    const t = index.nodes;
    const indexKeys = new Set(Array.from(t.morton, (m, i) => key(t.level[i]!, m)));

    expect(indexKeys.has(key(GRID.bits, 0))).toBe(true);
    for (const [k, n] of below) if (n > CAPACITY) expect(indexKeys.has(k)).toBe(true);

    const roots: { level: number; morton: number }[] = [];
    for (let i = 0; i < t.count; i++) {
      if (t.chunkRef[i] === NO_CHUNK_REF) continue;
      const chunk = chunks[t.chunkRef[i]!]!;
      expect([chunk.level, chunk.morton]).toEqual([t.level[i], t.morton[i]]);
      expect(below.get(key(t.level[i]!, t.morton[i]!))).toBeLessThanOrEqual(CAPACITY);
      expect(chunk.columns.get('absMag')!.length).toBe(below.get(key(t.level[i]!, t.morton[i]!)));
      roots.push({ level: t.level[i]!, morton: t.morton[i]! });
    }
    expect(roots.length).toBe(chunks.length);
    for (const a of roots) {
      for (const b of roots) {
        if (a.level <= b.level) continue;
        expect(b.morton >>> (3 * (a.level - b.level))).not.toBe(a.morton);
      }
    }
  });

  it('STOPs when a level-0 node would land in the index', () => {
    const records = Array.from({ length: 400 }, (_, i) => ({
      pos: [5 + i * 0.001, 5, 5] as [number, number, number],
      absMag: 14,
    }));
    const tree = stratifyOctree(makeOctreeBuildInput(records, GRID));
    expect(() => chunkOctree(tree, CAPACITY)).toThrow(/level 0/);
  });

  it('STOPs when a node owns more than MAX_OWN_COUNT records', () => {
    const records = Array.from({ length: 8193 }, () => ({
      pos: [5, 5, 5] as [number, number, number],
      absMag: 14,
    }));
    const tree = stratifyOctree(makeOctreeBuildInput(records, GRID));
    expect(() => chunkOctree(tree, 1_000_000)).toThrow(/MAX_OWN_COUNT/);
  });
});

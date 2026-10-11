import { describe, expect, it } from 'vitest';

import type { OctreeNodeTable } from '../../../src/@types/octree/OctreeNodeTable';
import type { StratifiedOctree } from '../../../tools/@types/octree/StratifiedOctree';
import { NO_CHUNK_REF } from '../../../src/data/octree/octreeFormat';
import { chunkOctree } from '../../../tools/octree/chunkOctree';
import { stratifyOctree } from '../../../tools/octree/stratifyOctree';
import { makeOctreeBuildInput, randomOctreeRecords } from '../../fixtures/makeOctreeBuildInput';

const GRID = { bits: 6, origin: [0, 0, 0] as [number, number, number], cellEdge: 10 };
const CAPACITY = 300;
const NODE_CAPACITY = 40;

const key = (level: number, morton: number) => `${level}:${morton}`;
const recordsOf = (t: OctreeNodeTable, i: number) => t.ownCount[i]! + (t.childMask[i] ? 1 : 0);

type Below = { readonly records: number; readonly rows: number };

/** Brute-force strict-descendant record and row counts of every row of the stratified tree. */
function descendantCounts(tree: StratifiedOctree): Map<string, Below> {
  const out = new Map<string, Below>();
  const walk = (row: number): Below => {
    let records = 0;
    let rows = 0;
    for (let o = 0; o < 8; o++) {
      const c = tree.childIndex[row * 8 + o]!;
      if (c < 0) continue;
      const below = walk(c);
      records += recordsOf(tree.nodes, c) + below.records;
      rows += 1 + below.rows;
    }
    out.set(key(tree.nodes.level[row]!, tree.nodes.morton[row]!), { records, rows });
    return { records, rows };
  };
  walk(tree.nodes.count - 1);
  return out;
}

function fixtureTree(): StratifiedOctree {
  return stratifyOctree(makeOctreeBuildInput(randomOctreeRecords(2000, 3, 640, [-6, 14]), GRID));
}

describe('chunkOctree', () => {
  it('a chunk decodes without any other chunk', () => {
    const objects = chunkOctree(fixtureTree(), CAPACITY, NODE_CAPACITY);
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

  it('a node over either bound stays in the index and the split recurses', () => {
    const tree = fixtureTree();
    const below = descendantCounts(tree);
    const { index, chunks } = chunkOctree(tree, CAPACITY, NODE_CAPACITY);
    const t = index.nodes;
    const indexKeys = new Set(Array.from(t.morton, (m, i) => key(t.level[i]!, m)));
    const overRowsOnly = [...below].filter(
      ([, b]) => b.records <= CAPACITY && b.rows > NODE_CAPACITY,
    );
    expect(overRowsOnly.length).toBeGreaterThan(0);

    expect(indexKeys.has(key(GRID.bits, 0))).toBe(true);
    for (const [k, b] of below) {
      if (b.records > CAPACITY || b.rows > NODE_CAPACITY) expect(indexKeys.has(k)).toBe(true);
    }
    expect(index.chunkNodeCap).toBeLessThanOrEqual(NODE_CAPACITY);

    const roots: { level: number; morton: number }[] = [];
    for (let i = 0; i < t.count; i++) {
      if (t.chunkRef[i] === NO_CHUNK_REF) continue;
      const chunk = chunks[t.chunkRef[i]!]!;
      expect([chunk.level, chunk.morton]).toEqual([t.level[i], t.morton[i]]);
      const b = below.get(key(t.level[i]!, t.morton[i]!))!;
      expect(b.records).toBeLessThanOrEqual(CAPACITY);
      expect(chunk.nodes.count).toBe(b.rows);
      expect(chunk.columns.get('absMag')!.length).toBe(b.records);
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
    expect(() => chunkOctree(tree, CAPACITY, NODE_CAPACITY)).toThrow(/level 0/);
  });

  it('STOPs when a node owns more than MAX_OWN_COUNT records', () => {
    const records = Array.from({ length: 8193 }, () => ({
      pos: [5, 5, 5] as [number, number, number],
      absMag: 14,
    }));
    const tree = stratifyOctree(makeOctreeBuildInput(records, GRID));
    expect(() => chunkOctree(tree, 1_000_000, NODE_CAPACITY)).toThrow(/MAX_OWN_COUNT/);
  });
});

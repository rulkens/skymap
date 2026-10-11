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
    const { index, chunks } = chunkOctree(fixtureTree(), CAPACITY, NODE_CAPACITY);
    expect(chunks.length).toBeGreaterThan(3);
    const t = index.nodes;
    for (const chunk of chunks) {
      const c = chunk.nodes;
      const rows = new Set(Array.from(c.morton, (m, i) => key(c.level[i]!, m)));
      const roots = chunk.roots.map((r) => ({ level: t.level[r]!, morton: t.morton[r]! }));
      const rootKeys = new Set(roots.map((r) => key(r.level, r.morton)));
      let records = 0;
      for (let i = 0; i < c.count; i++) {
        const parent = key(c.level[i]! + 1, c.morton[i]! >>> 3);
        expect(rows.has(parent) || rootKeys.has(parent)).toBe(true);
        const under = roots.filter(
          (r) =>
            r.level > c.level[i]! && c.morton[i]! >>> (3 * (r.level - c.level[i]!)) === r.morton,
        );
        expect(under.length).toBe(1);
        expect(c.firstRecord[i]).toBe(records);
        records += recordsOf(c, i);
      }
      expect(chunk.columns.get('absMag')!.length).toBe(records);
      expect(chunk.columns.get('offset')!.length).toBe(3 * records);
    }
  });

  it('a node over either bound stays in the index; roots pack into chunks under both bounds', () => {
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
    expect(index.chunkNodeCap).toBe(NODE_CAPACITY);

    const rootRows = Array.from(t.chunkRef, (ref, row) => (ref === NO_CHUNK_REF ? -1 : row));
    expect(chunks.flatMap((c) => c.roots).sort((a, b) => a - b)).toEqual(
      rootRows.filter((row) => row >= 0),
    );
    expect(chunks.some((c) => c.roots.length > 1)).toBe(true);
    const leafKeys = chunks.flatMap((c) => c.roots).map((r) => t.morton[r]! * 8 ** t.level[r]!);
    expect(leafKeys).toEqual([...leafKeys].sort((a, b) => a - b));
    chunks.forEach((chunk, ref) => {
      let rows = 0;
      let records = 0;
      for (const r of chunk.roots) {
        expect(t.chunkRef[r]).toBe(ref);
        const b = below.get(key(t.level[r]!, t.morton[r]!))!;
        rows += b.rows;
        records += b.records;
      }
      expect([chunk.level, chunk.morton]).toEqual([
        t.level[chunk.roots[0]!],
        t.morton[chunk.roots[0]!],
      ]);
      expect(chunk.nodes.count).toBe(rows);
      expect(chunk.columns.get('absMag')!.length).toBe(records);
      expect(rows).toBeLessThanOrEqual(NODE_CAPACITY);
      expect(records).toBeLessThanOrEqual(CAPACITY);
    });
    const roots = rootRows.filter((row) => row >= 0);
    for (const a of roots) {
      for (const b of roots) {
        if (t.level[a]! <= t.level[b]!) continue;
        expect(t.morton[b]! >>> (3 * (t.level[a]! - t.level[b]!))).not.toBe(t.morton[a]);
      }
    }
  });

  it('packing closes a chunk on records when rows never bind', () => {
    const { chunks } = chunkOctree(fixtureTree(), CAPACITY, Number.MAX_SAFE_INTEGER);
    expect(chunks.some((c) => c.roots.length > 1)).toBe(true);
    for (const chunk of chunks) {
      expect(chunk.columns.get('absMag')!.length).toBeLessThanOrEqual(CAPACITY);
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

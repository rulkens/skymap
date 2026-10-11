import { describe, expect, it } from 'vitest';

import type { OctreeNodeTable } from '../../../src/@types/octree/OctreeNodeTable';
import type { OctreeObjects } from '../../../tools/@types/octree/OctreeObjects';
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
const recordTotal = (t: OctreeNodeTable) => t.ownCount.reduce((a, _, i) => a + recordsOf(t, i), 0);

/** No row brighter than M = 4 is hoisted to the root, so the top can shrink under 300 records. */
function fixtureTree(): StratifiedOctree {
  return stratifyOctree(makeOctreeBuildInput(randomOctreeRecords(3000, 3, 640, [4, 14]), GRID));
}

/** The node table of chunk `parent`'s parent object: the index for null. */
const tableOf = (o: OctreeObjects, parent: number | null) =>
  parent === null ? o.index.nodes : o.chunks[parent]!.nodes;

describe('chunkOctree', () => {
  it('a chunk decodes without any other chunk; its roots are rows of its parent object', () => {
    const objects = chunkOctree(fixtureTree(), CAPACITY, NODE_CAPACITY);
    expect(objects.chunks.length).toBeGreaterThan(3);
    for (const chunk of objects.chunks) {
      const c = chunk.nodes;
      const host = tableOf(objects, chunk.parent);
      const rows = new Set(Array.from(c.morton, (m, i) => key(c.level[i]!, m)));
      const roots = chunk.roots.map((r) => ({ level: host.level[r]!, morton: host.morton[r]! }));
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
      const leafKeys = roots.map((r) => r.morton * 8 ** r.level);
      expect(leafKeys).toEqual([...leafKeys].sort((a, b) => a - b));
      expect([chunk.level, chunk.morton]).toEqual([roots[0]!.level, roots[0]!.morton]);
    }
    expect(objects.chunks.some((c) => c.roots.length > 1)).toBe(true);
  });

  it('nests until the top object fits both bounds; each chunk is listed once, ids breadth-first', () => {
    const tree = fixtureTree();
    const objects = chunkOctree(tree, CAPACITY, NODE_CAPACITY);
    const { index, chunks } = objects;
    const depth = (id: number): number => {
      const p = chunks[id]!.parent;
      return p === null ? 1 : 1 + depth(p);
    };
    expect(Math.max(...chunks.map((_, id) => depth(id)))).toBeGreaterThanOrEqual(3);

    for (const t of [index.nodes, ...chunks.map((c) => c.nodes)]) {
      expect(t.count).toBeLessThanOrEqual(NODE_CAPACITY);
      expect(recordTotal(t)).toBeLessThanOrEqual(CAPACITY);
    }
    expect(index.nodes.level[index.nodes.count - 1]).toBe(GRID.bits);
    expect(index.chunkNodeCap).toBe(NODE_CAPACITY);

    // Every tree row lands in exactly one object.
    const rowKeys = [index.nodes, ...chunks.map((c) => c.nodes)].flatMap((t) =>
      Array.from(t.morton, (m, i) => key(t.level[i]!, m)),
    );
    expect(new Set(rowKeys).size).toBe(tree.nodes.count);
    expect(rowKeys.length).toBe(tree.nodes.count);

    // A row names a chunk exactly where that chunk's parent lists it as a root.
    const named: string[] = [];
    [index.nodes, ...chunks.map((c) => c.nodes)].forEach((t, k) => {
      t.chunkRef.forEach((ref, row) => {
        if (ref !== NO_CHUNK_REF) named.push(`${ref}@${k - 1}:${row}`);
      });
    });
    const listed = chunks.flatMap((c, id) =>
      c.roots.map((row) => `${id}@${c.parent ?? -1}:${row}`),
    );
    expect(named.sort()).toEqual(listed.sort());

    // Breadth-first: parents in non-decreasing order, every parent before its children.
    const parents = chunks.map((c) => c.parent ?? -1);
    expect(parents).toEqual([...parents].sort((a, b) => a - b));
    parents.forEach((p, id) => expect(p).toBeLessThan(id));

    let base = recordTotal(index.nodes);
    for (const chunk of chunks) {
      expect(chunk.recordBase).toBe(base);
      base += recordTotal(chunk.nodes);
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

  it('STOPs when the top cannot shrink under the record bound', () => {
    // Stars down to M = −6 hoist hundreds of records into the root row alone.
    const tree = stratifyOctree(
      makeOctreeBuildInput(randomOctreeRecords(2000, 3, 640, [-6, 14]), GRID),
    );
    expect(tree.nodes.ownCount[tree.nodes.count - 1]).toBeGreaterThan(CAPACITY);
    expect(() => chunkOctree(tree, CAPACITY, NODE_CAPACITY)).toThrow(/nesting STOP/);
  });
});

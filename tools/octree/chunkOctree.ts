/**
 * Capacity-bounded chunking (spec §4). From the root down, a node with children whose
 * strict-descendant records fit `capacity` becomes a chunk root: its row stays in the index
 * (own records + blob, so an absent chunk draws as a glow) and every row below it moves into
 * its chunk, renumbered object-local. Over capacity, the node stays and the split recurses.
 */
import type { ColumnId } from '../../src/@types/octree/ColumnId';
import type { OctreeNodeTable } from '../../src/@types/octree/OctreeNodeTable';
import type { OctreeObjects } from '../@types/octree/OctreeObjects';
import type { StratifiedOctree } from '../@types/octree/StratifiedOctree';
import { MAX_OWN_COUNT, NO_CHUNK_REF } from '../../src/data/octree/octreeFormat';

const OCTANTS = 8;
const IN_INDEX = -1;

export function chunkOctree(tree: StratifiedOctree, capacity: number): OctreeObjects {
  const { nodes, childIndex } = tree;
  const count = nodes.count;
  const recordsOf = (i: number) => nodes.ownCount[i]! + (nodes.childMask[i] !== 0 ? 1 : 0);
  for (let i = 0; i < count; i++) {
    if (nodes.ownCount[i]! > MAX_OWN_COUNT) {
      throw new Error(
        `dense-cell STOP: level ${nodes.level[i]} node ${nodes.morton[i]} owns ` +
          `${nodes.ownCount[i]} records > MAX_OWN_COUNT ${MAX_OWN_COUNT}`,
      );
    }
  }

  const descendants = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    for (let o = 0; o < OCTANTS; o++) {
      const c = childIndex[i * OCTANTS + o]!;
      if (c >= 0) descendants[i]! += recordsOf(c) + descendants[c]!;
    }
  }

  // Parents before children: rows sort by level, so walk them backwards from the root.
  const owner = new Int32Array(count).fill(IN_INDEX);
  const isChunkRoot = new Uint8Array(count);
  for (let i = count - 1; i >= 0; i--) {
    let childOwner = owner[i]!;
    if (owner[i] === IN_INDEX) {
      if (nodes.childMask[i] !== 0 && descendants[i]! <= capacity) {
        isChunkRoot[i] = 1;
        childOwner = i;
      }
    }
    for (let o = 0; o < OCTANTS; o++) {
      const c = childIndex[i * OCTANTS + o]!;
      if (c < 0) continue;
      if (childOwner === IN_INDEX && nodes.level[c] === 0) {
        throw new Error(
          `dense-cell STOP: level 0 node ${nodes.morton[c]} would land in the index; its parent ` +
            `(level ${nodes.level[i]} node ${nodes.morton[i]}) holds ${descendants[i]} ` +
            `descendant records > chunkCapacity ${capacity}`,
        );
      }
      owner[c] = childOwner;
    }
  }

  const indexRows: number[] = [];
  const roots: number[] = [];
  const chunkOfRoot = new Int32Array(count).fill(IN_INDEX);
  for (let i = 0; i < count; i++) {
    if (owner[i] !== IN_INDEX) continue;
    if (isChunkRoot[i]) chunkOfRoot[i] = roots.push(i) - 1;
    indexRows.push(i);
  }
  const chunkRows: number[][] = roots.map(() => []);
  for (let i = 0; i < count; i++) {
    if (owner[i] !== IN_INDEX) chunkRows[chunkOfRoot[owner[i]!]!]!.push(i);
  }

  const index = gatherRows(tree, indexRows, recordsOf);
  indexRows.forEach((row, k) => {
    if (isChunkRoot[row]) index.nodes.chunkRef[k] = chunkOfRoot[row]!;
  });
  return {
    index: { ...index, chunkNodeCap: chunkRows.reduce((m, rows) => Math.max(m, rows.length), 0) },
    chunks: chunkRows.map((rows, k) => ({
      level: nodes.level[roots[k]!]!,
      morton: nodes.morton[roots[k]!]!,
      ...gatherRows(tree, rows, recordsOf),
    })),
  };
}

/** Copies `rows` (ascending) and their records into a fresh object, firstRecord renumbered from 0. */
function gatherRows(
  tree: StratifiedOctree,
  rows: readonly number[],
  recordsOf: (row: number) => number,
): { nodes: OctreeNodeTable; columns: Map<ColumnId, Float32Array> } {
  const src = tree.nodes;
  const n = rows.length;
  const nodes: OctreeNodeTable = {
    count: n,
    morton: new Uint32Array(n),
    level: new Uint8Array(n),
    childMask: new Uint8Array(n),
    firstRecord: new Uint32Array(n),
    ownCount: new Uint32Array(n),
    blobCount: new Uint32Array(n),
    chunkRef: new Uint32Array(n).fill(NO_CHUNK_REF),
  };
  let records = 0;
  rows.forEach((row, k) => {
    nodes.morton[k] = src.morton[row]!;
    nodes.level[k] = src.level[row]!;
    nodes.childMask[k] = src.childMask[row]!;
    nodes.firstRecord[k] = records;
    nodes.ownCount[k] = src.ownCount[row]!;
    nodes.blobCount[k] = src.blobCount[row]!;
    records += recordsOf(row);
  });

  const totalRecords =
    src.count === 0 ? 0 : src.firstRecord[src.count - 1]! + recordsOf(src.count - 1);
  const columns = new Map<ColumnId, Float32Array>();
  for (const [id, values] of tree.columns) {
    const width = totalRecords === 0 ? 1 : values.length / totalRecords;
    const out = new Float32Array(records * width);
    rows.forEach((row, k) => {
      const from = src.firstRecord[row]! * width;
      out.set(values.subarray(from, from + recordsOf(row) * width), nodes.firstRecord[k]! * width);
    });
    columns.set(id, out);
  }
  return { nodes, columns };
}

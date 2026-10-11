/**
 * Capacity-bounded chunking (spec §4). From the root down, a node with children whose
 * strict-descendant records fit `capacity` and strict-descendant rows fit `nodeCapacity` becomes
 * a chunk root: its row stays in the index (own records + blob, so an absent chunk draws as a
 * glow) and every row below it moves into a chunk, renumbered object-local. Over either bound,
 * the node stays and the split recurses. Roots then pack in Morton order into chunks under the
 * same two bounds, so outskirt subtrees of a few rows share one object instead of each paying a
 * request and a slot.
 */
import type { ColumnId } from '../../src/@types/octree/ColumnId';
import type { OctreeNodeTable } from '../../src/@types/octree/OctreeNodeTable';
import type { OctreeObjects } from '../@types/octree/OctreeObjects';
import type { StratifiedOctree } from '../@types/octree/StratifiedOctree';
import {
  MAX_OWN_COUNT,
  NO_CHUNK_REF,
  OCTANT_BITS,
  OCTANTS,
} from '../../src/data/octree/octreeFormat';

const IN_INDEX = -1;

export function chunkOctree(
  tree: StratifiedOctree,
  capacity: number,
  nodeCapacity: number,
): OctreeObjects {
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
  const descendantRows = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    for (let o = 0; o < OCTANTS; o++) {
      const c = childIndex[i * OCTANTS + o]!;
      if (c < 0) continue;
      descendants[i]! += recordsOf(c) + descendants[c]!;
      descendantRows[i]! += 1 + descendantRows[c]!;
    }
  }

  // Parents before children: rows sort by level, so walk them backwards from the root.
  const owner = new Int32Array(count).fill(IN_INDEX);
  const isChunkRoot = new Uint8Array(count);
  for (let i = count - 1; i >= 0; i--) {
    let childOwner = owner[i]!;
    if (owner[i] === IN_INDEX) {
      const fits = descendants[i]! <= capacity && descendantRows[i]! <= nodeCapacity;
      if (nodes.childMask[i] !== 0 && fits) {
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
            `(level ${nodes.level[i]} node ${nodes.morton[i]}) holds ${descendants[i]} records / ` +
            `${descendantRows[i]} rows below it, over chunkCapacity ${capacity} or nodeCapacity ` +
            `${nodeCapacity}`,
        );
      }
      owner[c] = childOwner;
    }
  }

  const indexRows: number[] = [];
  const indexRowOf = new Int32Array(count).fill(IN_INDEX);
  const roots: number[] = [];
  for (let i = 0; i < count; i++) {
    if (owner[i] !== IN_INDEX) continue;
    if (isChunkRoot[i]) roots.push(i);
    indexRowOf[i] = indexRows.push(i) - 1;
  }

  // A box's leaf-cell Morton key orders disjoint subtrees depth-first, so a run of roots is a
  // run of neighbouring space; `morton·8^level` stays below 2^(3·bits), exact in an f64.
  const leafKey = (i: number) => nodes.morton[i]! * 2 ** (OCTANT_BITS * nodes.level[i]!);
  roots.sort((a, b) => leafKey(a) - leafKey(b));
  const chunkOfRoot = new Int32Array(count).fill(IN_INDEX);
  const rootsOfChunk: number[][] = [];
  let rows = 0;
  let records = 0;
  for (const r of roots) {
    const open = rootsOfChunk.length > 0;
    if (!open || rows + descendantRows[r]! > nodeCapacity || records + descendants[r]! > capacity) {
      rootsOfChunk.push([]);
      rows = 0;
      records = 0;
    }
    rows += descendantRows[r]!;
    records += descendants[r]!;
    chunkOfRoot[r] = rootsOfChunk.length - 1;
    rootsOfChunk[rootsOfChunk.length - 1]!.push(r);
  }

  const chunkRows: number[][] = rootsOfChunk.map(() => []);
  for (let i = 0; i < count; i++) {
    if (owner[i] !== IN_INDEX) chunkRows[chunkOfRoot[owner[i]!]!]!.push(i);
  }

  const index = gatherRows(tree, indexRows, recordsOf);
  for (const r of roots) index.nodes.chunkRef[indexRowOf[r]!] = chunkOfRoot[r]!;
  return {
    index: { ...index, chunkNodeCap: nodeCapacity },
    chunks: chunkRows.map((rows, k) => {
      const chunkRoots = rootsOfChunk[k]!;
      return {
        level: nodes.level[chunkRoots[0]!]!,
        morton: nodes.morton[chunkRoots[0]!]!,
        roots: chunkRoots.map((r) => indexRowOf[r]!),
        ...gatherRows(tree, rows, recordsOf),
      };
    }),
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

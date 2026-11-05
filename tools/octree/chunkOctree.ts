/**
 * Capacity-bounded, nesting chunking (spec §4). One pass: from the top down, a node with
 * children whose strict-descendant records fit `capacity` and rows fit `nodeCapacity` becomes a
 * chunk root; its row stays above (own records + blob, so an absent chunk draws as a glow) and
 * every row below it moves into a chunk. Passes repeat over the rows left above until that top
 * object, the index, fits the same two bounds. Then, from the last pass down, each object's
 * roots pack in Morton order into chunks under both bounds, so a chunk's roots share one parent
 * object. Ids run breadth-first from the index; record ordinals follow ids.
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

/** A row still in the top object, or (as a host) the index itself. */
const TOP = -1;

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

  // Per row: the root it moved under (TOP while above every root). Per root: the pass that
  // found it and its subtree's rows and records then, which are its chunk's share.
  const movedUnder = new Int32Array(count).fill(TOP);
  const rootPass = new Uint32Array(count);
  const subRows = new Uint32Array(count);
  const subRecords = new Uint32Array(count);
  const below = new Uint32Array(count);
  const belowRows = new Uint32Array(count);
  const owner = new Int32Array(count);
  let passes = 0;
  let topRows = count;
  let topRecords = 0;
  do {
    passes++;
    below.fill(0);
    belowRows.fill(0);
    // Rows sort by level, so ascending visits children first, descending parents first.
    for (let i = 0; i < count; i++) {
      if (movedUnder[i] !== TOP) continue;
      for (let o = 0; o < OCTANTS; o++) {
        const c = childIndex[i * OCTANTS + o]!;
        if (c < 0 || movedUnder[c] !== TOP) continue;
        below[i]! += recordsOf(c) + below[c]!;
        belowRows[i]! += 1 + belowRows[c]!;
      }
    }
    owner.fill(TOP);
    let found = 0;
    for (let i = count - 1; i >= 0; i--) {
      if (movedUnder[i] !== TOP) continue;
      let childOwner = owner[i]!;
      const fits = below[i]! <= capacity && belowRows[i]! <= nodeCapacity;
      if (childOwner === TOP && belowRows[i]! > 0 && fits) {
        rootPass[i] = passes;
        subRows[i] = belowRows[i]!;
        subRecords[i] = below[i]!;
        childOwner = i;
        found++;
      }
      for (let o = 0; o < OCTANTS; o++) {
        const c = childIndex[i * OCTANTS + o]!;
        if (c < 0 || movedUnder[c] !== TOP) continue;
        if (childOwner === TOP && nodes.level[c] === 0) {
          throw new Error(
            `dense-cell STOP: level 0 node ${nodes.morton[c]} would land in the index; its parent ` +
              `(level ${nodes.level[i]} node ${nodes.morton[i]}) holds ${below[i]} records / ` +
              `${belowRows[i]} rows below it, over chunkCapacity ${capacity} or nodeCapacity ` +
              `${nodeCapacity}`,
          );
        }
        owner[c] = childOwner;
      }
    }
    topRows = 0;
    topRecords = 0;
    for (let i = 0; i < count; i++) {
      if (movedUnder[i] !== TOP) continue;
      if (owner[i] !== TOP) movedUnder[i] = owner[i]!;
      else {
        topRows++;
        topRecords += recordsOf(i);
      }
    }
    if (found === 0 && (topRows > nodeCapacity || topRecords > capacity)) {
      throw new Error(
        `nesting STOP: the top object holds ${topRows} rows / ${topRecords} records, over ` +
          `nodeCapacity ${nodeCapacity} or chunkCapacity ${capacity}, and no row's subtree in it fits`,
      );
    }
  } while (topRows > nodeCapacity || topRecords > capacity);

  // From the last pass down, every root's host object is already built: pack each host's roots.
  // A box's leaf-cell Morton key orders disjoint subtrees depth-first, so a run of roots is a
  // run of neighbouring space; `morton·8^level` stays below 2^(3·bits), exact in an f64.
  const leafKey = (i: number) => nodes.morton[i]! * 2 ** (OCTANT_BITS * nodes.level[i]!);
  const chunkOfRoot = new Int32Array(count).fill(TOP);
  const built: { host: number; roots: number[] }[] = [];
  const hostOf = (row: number) => (movedUnder[row] === TOP ? TOP : chunkOfRoot[movedUnder[row]!]!);
  for (let pass = passes; pass >= 1; pass--) {
    const rootsByHost = new Map<number, number[]>();
    for (let i = 0; i < count; i++) {
      if (rootPass[i] !== pass) continue;
      const host = hostOf(i);
      const group = rootsByHost.get(host);
      if (group === undefined) rootsByHost.set(host, [i]);
      else group.push(i);
    }
    for (const [host, roots] of rootsByHost) {
      roots.sort((a, b) => leafKey(a) - leafKey(b));
      let rows = 0;
      let records = 0;
      let open: number[] | null = null;
      for (const r of roots) {
        if (
          open === null ||
          rows + subRows[r]! > nodeCapacity ||
          records + subRecords[r]! > capacity
        ) {
          open = [];
          built.push({ host, roots: open });
          rows = 0;
          records = 0;
        }
        rows += subRows[r]!;
        records += subRecords[r]!;
        chunkOfRoot[r] = built.length - 1;
        open.push(r);
      }
    }
  }

  // Ids breadth-first from the index, each host's chunks in Morton order of their first root.
  const kidsOf = new Map<number, number[]>();
  built.forEach(({ host }, b) => {
    const kids = kidsOf.get(host);
    if (kids === undefined) kidsOf.set(host, [b]);
    else kids.push(b);
  });
  const idOf = new Int32Array(built.length);
  const byId: number[] = [];
  for (let q = [TOP]; q.length > 0; ) {
    const next: number[] = [];
    for (const host of q) {
      const kids = (kidsOf.get(host) ?? []).sort(
        (a, b) => leafKey(built[a]!.roots[0]!) - leafKey(built[b]!.roots[0]!),
      );
      for (const b of kids) {
        idOf[b] = byId.push(b) - 1;
        next.push(b);
      }
    }
    q = next;
  }

  const rowsOf: number[][] = built.map(() => []);
  const indexRows: number[] = [];
  const localRow = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const rows = movedUnder[i] === TOP ? indexRows : rowsOf[chunkOfRoot[movedUnder[i]!]!]!;
    localRow[i] = rows.push(i) - 1;
  }
  const chunkRefOf = (row: number) =>
    chunkOfRoot[row] === TOP ? NO_CHUNK_REF : idOf[chunkOfRoot[row]!]!;

  const index = gatherRows(tree, indexRows, recordsOf, chunkRefOf);
  let recordBase = index.records;
  return {
    index: {
      nodes: index.nodes,
      columns: index.columns,
      chunkCapacity: capacity,
      chunkNodeCap: nodeCapacity,
    },
    chunks: byId.map((b) => {
      const { host, roots } = built[b]!;
      const object = gatherRows(tree, rowsOf[b]!, recordsOf, chunkRefOf);
      const chunk = {
        level: nodes.level[roots[0]!]!,
        morton: nodes.morton[roots[0]!]!,
        parent: host === TOP ? null : idOf[host]!,
        roots: roots.map((r) => localRow[r]!),
        recordBase,
        nodes: object.nodes,
        columns: object.columns,
      };
      recordBase += object.records;
      return chunk;
    }),
  };
}

/** Copies `rows` (ascending) and their records into a fresh object, firstRecord renumbered from 0. */
function gatherRows(
  tree: StratifiedOctree,
  rows: readonly number[],
  recordsOf: (row: number) => number,
  chunkRefOf: (row: number) => number,
): { nodes: OctreeNodeTable; columns: Map<ColumnId, Float32Array>; records: number } {
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
    chunkRef: new Uint32Array(n),
  };
  let records = 0;
  rows.forEach((row, k) => {
    nodes.morton[k] = src.morton[row]!;
    nodes.level[k] = src.level[row]!;
    nodes.childMask[k] = src.childMask[row]!;
    nodes.firstRecord[k] = records;
    nodes.ownCount[k] = src.ownCount[row]!;
    nodes.blobCount[k] = src.blobCount[row]!;
    nodes.chunkRef[k] = chunkRefOf(row);
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
  return { nodes, columns, records };
}

/**
 * multiRootStarOctree — a hand-built v2 `Octree` (1 pc cells, origin 0) whose one chunk holds
 * two roots at different levels, so the chunk's last rows belong to only one of them:
 *
 *   index row 0  level 1 [4,6)³  root of chunk 0; blob record 0
 *   index row 1  level 2 [0,4)³  root of chunk 0; blob record 1
 *   index row 2  level 2 [4,8)³  plain row over index row 0; blob record 2
 *   index row 3  level 3 [0,8)³  the root; blob record 3
 *   chunk row 0  level 0 [4,5)³  a star at (4.5,4.5,4.5) pc, under index row 0 (ordinal 4)
 *   chunk row 1  level 1 [0,2)³  a star at (0.5,0.5,0.5) pc, under index row 1 (ordinal 5)
 */
import type { OctreeChunk } from '../../src/@types/octree/OctreeChunk';
import type { StarColumns } from '../../src/@types/data/starCatalog/StarColumns';
import type { Octree } from '../../src/@types/octree/Octree';
import type { OctreeNodeTable } from '../../src/@types/octree/OctreeNodeTable';
import {
  NO_CHUNK_REF,
  OFFSET_FRACTION_LEVELS
} from '../../src/data/octree/octreeFormat';
import { STAR_COLUMN_SCHEMA } from "../../src/data/octree/starOctreeFamily";

function columns(offsets: readonly number[]): StarColumns {
  const count = offsets.length / 3;
  return {
    count,
    offset: Uint16Array.from(offsets, (f) => f * OFFSET_FRACTION_LEVELS),
    absMag: new Float32Array(count).fill(4),
    colourIndex: new Float32Array(count).fill(0.5),
  };
}

/** Rows as [level, morton, childMask, firstRecord, ownCount, blobCount, chunkRef]. */
function table(rows: readonly (readonly number[])[]): OctreeNodeTable {
  const col = (k: number) => rows.map((r) => r[k]!);
  return {
    count: rows.length,
    level: Uint8Array.from(col(0)),
    morton: Uint32Array.from(col(1)),
    childMask: Uint8Array.from(col(2)),
    firstRecord: Uint32Array.from(col(3)),
    ownCount: Uint32Array.from(col(4)),
    blobCount: Uint32Array.from(col(5)),
    chunkRef: Uint32Array.from(col(6)),
  };
}

export function multiRootStarOctree(): { octree: Octree<StarColumns>; chunk: OctreeChunk<StarColumns> } {
  const octree: Octree<StarColumns> = {
    grid: { bits: 10, origin: [0, 0, 0], cellEdge: 1 },
    family: 'star',
    recordCount: 2,
    columns: STAR_COLUMN_SCHEMA,
    nodes: table([
      [1, 56, 1, 0, 0, 1, 0],
      [2, 0, 1, 1, 0, 1, 0],
      [2, 7, 1, 2, 0, 1, NO_CHUNK_REF],
      [3, 0, 0b1000_0001, 3, 0, 2, NO_CHUNK_REF],
    ]),
    records: columns(new Array(12).fill(0.5)),
    chunks: [
      { id: 0, level: 2, morton: 0, roots: [1, 0], hash: 'fixture0', bytes: 0, nodes: 2, records: 2, recordBase: 4 },
    ],
    chunkCapacity: 8,
    chunkNodeCap: 2,
    chunkCount: 1,
  };
  const chunk: OctreeChunk<StarColumns> = {
    ref: octree.chunks[0]!,
    parent: null,
    nodes: table([
      [0, 448, 0, 0, 1, 0, NO_CHUNK_REF],
      [1, 0, 0, 1, 1, 0, NO_CHUNK_REF],
    ]),
    records: columns([0.5, 0.5, 0.5, 0.25, 0.25, 0.25]),
    chunks: [],
  };
  return { octree, chunk };
}

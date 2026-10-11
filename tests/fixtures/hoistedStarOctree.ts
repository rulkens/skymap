/**
 * hoistedStarOctree — a hand-built v2 `StarOctree` (1 pc cells, origin 0) with one chunk:
 *
 *   index row 0  level 2 [0,4)³  chunk root of chunk 0; its blob is record 0
 *   index row 1  level 3 [0,8)³  the root; one hoisted star at (6,6,6) pc (record 1), blob record 2
 *   chunk row 0  level 1 [0,2)³  two stars at (0.5,0.5,0.5) and (1.5,1.5,1.5) pc
 *
 * Ordinals: 0 blob, 1 hoisted star, 2 blob, 3 and 4 the chunk's stars.
 */
import type { StarChunk } from '../../src/@types/data/starCatalog/StarChunk';
import type { StarColumns } from '../../src/@types/data/starCatalog/StarColumns';
import type { StarOctree } from '../../src/@types/data/starCatalog/StarOctree';
import type { OctreeNodeTable } from '../../src/@types/octree/OctreeNodeTable';
import {
  NO_CHUNK_REF,
  OFFSET_FRACTION_LEVELS,
  STAR_COLUMN_SCHEMA,
} from '../../src/data/octree/octreeFormat';

/** A box fraction as the `u16x3` raw value. */
const frac = (f: number) => f * OFFSET_FRACTION_LEVELS;

function columns(offsets: readonly number[], absMag: readonly number[]): StarColumns {
  return {
    count: absMag.length,
    offset: Uint16Array.from(offsets, frac),
    absMag: Float32Array.from(absMag),
    colourIndex: Float32Array.from(absMag, () => 0.5),
  };
}

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

export function hoistedStarOctree(): { octree: StarOctree; chunk: StarChunk } {
  const chunkNodes = table([[1, 0, 0, 0, 2, 0, NO_CHUNK_REF]]);
  const octree: StarOctree = {
    grid: { bits: 10, origin: [0, 0, 0], cellEdge: 1 },
    starCount: 3,
    columns: STAR_COLUMN_SCHEMA,
    // level, morton, childMask, firstRecord, ownCount, blobCount, chunkRef
    nodes: table([
      [2, 0, 1, 0, 0, 2, 0],
      [3, 0, 1, 1, 1, 2, NO_CHUNK_REF],
    ]),
    records: columns([0.5, 0.5, 0.5, 0.75, 0.75, 0.75, 0.5, 0.5, 0.5], [3, -5, 2]),
    chunks: [
      { id: 0, level: 2, morton: 0, roots: [0], hash: 'fixture0', bytes: 0, nodes: 1, records: 2, recordBase: 3 },
    ],
    chunkCapacity: 8,
    chunkNodeCap: 1,
    chunkCount: 1,
  };
  const chunk: StarChunk = {
    ref: octree.chunks[0]!,
    parent: null,
    nodes: chunkNodes,
    records: columns([0.25, 0.25, 0.25, 0.75, 0.75, 0.75], [4, 6]),
  };
  return { octree, chunk };
}

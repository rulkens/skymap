/**
 * The SKST v1 reader's adapter to the shared runtime shape (spec §5.1): a v1 leaf
 * owns its records and has no blob; a v1 aggregate owns none and its one record is
 * its blob, already at `firstRecord`. The 10-bit in-box offsets widen to the 16-bit
 * fraction of the box. One SKST object is the whole catalog, so there are no chunks.
 */
import type { SkstCatalog } from '../../@types/data/starCatalog/SkstCatalog';
import type { StarOctree } from '../../@types/data/starCatalog/StarOctree';
import type { OctreeNodeTable } from '../../@types/octree/OctreeNodeTable';
import { NO_CHUNK_REF, OCTANTS, STAR_COLUMN_SCHEMA } from '../../data/octree/octreeFormat';
import {
  colorIdxToBpRp,
  lutIndexToAbsMag,
  RECORD_BYTES,
} from '../../data/starCatalog/starCatalogFormat';
import { starOctreeIndex } from './starOctreeIndex';

/** 10-bit v1 offset → 16-bit fraction of the box. */
const OFFSET_WIDEN_SHIFT = 6;
// The v1 record is two 24-bit halves (`packStarRecord`); offsetZ straddles them.
const HALF_BYTES = 3;
const OFFSET_BITS = 10;
const OFFSET_MASK = 0x3ff;
const Z_LOW_BITS = 4;
const Z_LOW_MASK = 0xf;
const Z_HIGH_MASK = 0x3f;
const ABSMAG_SHIFT = 6;
const ABSMAG_MASK = 0x7f;
const COLOR_SHIFT = 13;
const COLOR_MASK = 0x3f;

export function starOctreeFromSkst(cat: SkstCatalog): StarOctree {
  const grid = { bits: cat.mortonBitsPerAxis, origin: cat.gridOrigin, cellEdge: cat.cellEdgePc };
  const n = cat.nodes.length;
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
  for (let i = 0; i < n; i++) {
    const node = cat.nodes[i]!;
    nodes.morton[i] = node.mortonIndex;
    nodes.level[i] = node.level;
    nodes.childMask[i] = node.childMask;
    nodes.firstRecord[i] = node.firstRecord;
    nodes.ownCount[i] = node.childMask === 0 ? node.recordCount : 0;
  }

  // Rows sort (level, morton), so a forward scan sums every child before its parent.
  const { childIndex } = starOctreeIndex(nodes, grid);
  const subtree = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    if (nodes.childMask[i] === 0) {
      subtree[i] = nodes.ownCount[i]!;
      continue;
    }
    let sum = 0;
    for (let k = 0; k < OCTANTS; k++) {
      const child = childIndex[i * OCTANTS + k]!;
      if (child >= 0) sum += subtree[child]!;
    }
    subtree[i] = sum;
    nodes.blobCount[i] = sum;
  }

  const count = cat.records.length / RECORD_BYTES;
  const offset = new Uint16Array(count * 3);
  const absMag = new Float32Array(count);
  const colourIndex = new Float32Array(count);
  const bytes = cat.records;
  for (let r = 0; r < count; r++) {
    const at = r * RECORD_BYTES;
    const lo = bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16);
    const h = at + HALF_BYTES;
    const hi = bytes[h]! | (bytes[h + 1]! << 8) | (bytes[h + 2]! << 16);
    const z = ((lo >>> (2 * OFFSET_BITS)) & Z_LOW_MASK) | ((hi & Z_HIGH_MASK) << Z_LOW_BITS);
    offset[3 * r] = (lo & OFFSET_MASK) << OFFSET_WIDEN_SHIFT;
    offset[3 * r + 1] = ((lo >>> OFFSET_BITS) & OFFSET_MASK) << OFFSET_WIDEN_SHIFT;
    offset[3 * r + 2] = z << OFFSET_WIDEN_SHIFT;
    absMag[r] = lutIndexToAbsMag((hi >>> ABSMAG_SHIFT) & ABSMAG_MASK);
    colourIndex[r] = colorIdxToBpRp((hi >>> COLOR_SHIFT) & COLOR_MASK);
  }

  return {
    grid,
    starCount: cat.starCount,
    columns: STAR_COLUMN_SCHEMA,
    nodes,
    records: { count, offset, absMag, colourIndex },
    chunks: [],
    chunkCapacity: 0,
    chunkNodeCap: 0,
    recordOrdinalBase: Uint32Array.of(count),
  };
}

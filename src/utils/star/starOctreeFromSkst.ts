/**
 * The SKST v1 reader's adapter to the shared runtime shape (spec §5.1): a v1 leaf
 * owns its records and has no blob; a v1 aggregate owns none and its one record is
 * its blob, already at `firstRecord`. The 10-bit in-box offsets widen to the 16-bit
 * fraction of the box. One SKST object is the whole catalog, so there are no chunks.
 */
import type { SkstCatalog } from '../../@types/data/starCatalog/SkstCatalog';
import type { Octree } from '../../@types/octree/Octree';
import type { OctreeNodeTable } from '../../@types/octree/OctreeNodeTable';
import { NO_CHUNK_REF, OCTANTS } from '../../data/octree/octreeFormat';
import {
  colorIdxToBpRp,
  lutIndexToAbsMag,
  RECORD_BYTES,
  unpackStarRecord,
} from '../../data/starCatalog/starCatalogFormat';
import { octreeIndex } from '../octree/octreeIndex';
import type { StarColumns } from '../../@types/data/starCatalog/StarColumns';
import { STAR_COLUMN_SCHEMA } from '../../data/octree/starOctreeFamily';

/** 10-bit v1 offset → 16-bit fraction of the box. */
const OFFSET_WIDEN_SHIFT = 6;

export function starOctreeFromSkst(cat: SkstCatalog): Octree<StarColumns> {
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
  const { childIndex } = octreeIndex(nodes, grid);
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
  for (let r = 0; r < count; r++) {
    const rec = unpackStarRecord(cat.records, r * RECORD_BYTES);
    offset[3 * r] = rec.offset[0] << OFFSET_WIDEN_SHIFT;
    offset[3 * r + 1] = rec.offset[1] << OFFSET_WIDEN_SHIFT;
    offset[3 * r + 2] = rec.offset[2] << OFFSET_WIDEN_SHIFT;
    absMag[r] = lutIndexToAbsMag(rec.absMagIdx);
    colourIndex[r] = colorIdxToBpRp(rec.colorIdx);
  }

  return {
    grid,
    family: 'star',
    recordCount: cat.starCount,
    columns: STAR_COLUMN_SCHEMA,
    nodes,
    records: { count, offset, absMag, colourIndex },
    chunks: [],
    chunkCount: 0,
    chunkCapacity: 0,
    chunkNodeCap: 0,
  };
}

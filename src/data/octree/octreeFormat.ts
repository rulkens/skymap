/**
 * Byte layout of the chunked octree container (index `SKOI` and chunk `SKOC` objects); a
 * wire-format contract, so it runs over the comment budget. The spec §2 is the authority.
 *
 * Framing: magic (4 ASCII) · version u16 · headerBytes u32 · JSON header space-padded so the
 * node table starts on a multiple of `OCTREE_ALIGN` · node table (24 B rows) · one record
 * column per schema entry, each starting on a multiple of `OCTREE_ALIGN`. Little-endian.
 */
import type { ColumnSchema } from '../../@types/octree/ColumnSchema';
import type { ColumnStore } from '../../@types/octree/ColumnStore';
import type { OctreeChunkRef } from '../../@types/octree/OctreeChunkRef';
import {
  STAR_ABSMAG_MIN,
  STAR_ABSMAG_STEP,
  STAR_COLORIDX_MIN,
  STAR_COLORIDX_STEP,
} from '../starCatalog/starCatalogFormat';

export const OCTREE_INDEX_MAGIC = 'SKOI';
export const OCTREE_CHUNK_MAGIC = 'SKOC';
export const OCTREE_VERSION = 1;
export const OCTREE_VERSION_OFFSET = 4;
export const OCTREE_HEADER_BYTES_OFFSET = 6;
export const OCTREE_JSON_OFFSET = 10;
export const OCTREE_ALIGN = 8;

export const OCTREE_NODE_BYTES = 24;
export const NODE_MORTON_OFFSET = 0;
export const NODE_LEVEL_OFFSET = 4;
export const NODE_CHILD_MASK_OFFSET = 5;
// Bytes 6–7 are reserved, zero.
export const NODE_FIRST_RECORD_OFFSET = 8;
export const NODE_OWN_COUNT_OFFSET = 12;
export const NODE_BLOB_COUNT_OFFSET = 16;
export const NODE_CHUNK_REF_OFFSET = 20;
export const NO_CHUNK_REF = 0xffffffff;

/**
 * Bytes per record. `u10x3` packs x into bits 0–9, y 10–19, z 20–29 of one u32 (2 bits spare);
 * `u16x3` is x bits 0–15, y 16–31, z 32–47, little-endian over 6 bytes.
 */
export const COLUMN_STORE_BYTES: Readonly<Record<ColumnStore, number>> = {
  f32: 4,
  f16: 2,
  u8: 1,
  u16: 2,
  u32: 4,
  u64: 8,
  i8: 1,
  u10x3: 4,
  u16x3: 6,
};
export const U10X3_COMPONENT_MASK = 0x3ff;
export const U10X3_Y_SHIFT = 10;
export const U10X3_Z_SHIFT = 20;
export const U16X3_Y_BYTE_OFFSET = 2;
export const U16X3_Z_BYTE_OFFSET = 4;
/** Components per packed-vector record. */
export const PACKED_VECTOR_COMPONENTS = 3;
/** ASCII space: the JSON header's right padding, which `JSON.parse` ignores. */
export const OCTREE_JSON_PAD_BYTE = 0x20;

/** `u16x3` raw / this = fraction of the owning node's box (not of the leaf cell). */
export const OFFSET_FRACTION_LEVELS = 65536;
/** Bake STOP above: the cut's leaf list addresses a node's records as a 10-bit block index × 8. */
export const MAX_OWN_COUNT = 8192;
/** Morton keys must fit 30 bits of a u32. */
export const MAX_GRID_BITS = 10;
/** Children per node; a child's Morton key is its parent's shifted left by `OCTANT_BITS`. */
export const OCTANTS = 8;
export const OCTANT_BITS = 3;
/** `level·2^32 + morton`: a unique row key that sorts as (level, morton), exact in an f64. */
export const LEVEL_KEY_STRIDE = 2 ** 32;

export const STAR_OCTREE_DATA_PREFIX = 'star-catalog/v2';

// The q pairs reproduce `lutIndexToAbsMag` / `colorIdxToBpRp` (bin centres), so upload
// re-quantises to the frozen LUT without loss.
export const STAR_COLUMN_SCHEMA: readonly ColumnSchema[] = [
  { id: 'offset', store: 'u16x3', q0: 0, q1: 1 },
  {
    id: 'absMag',
    store: 'u8',
    q0: STAR_ABSMAG_MIN + 0.5 * STAR_ABSMAG_STEP,
    q1: STAR_ABSMAG_STEP,
  },
  {
    id: 'colourIndex',
    store: 'u8',
    q0: STAR_COLORIDX_MIN + 0.5 * STAR_COLORIDX_STEP,
    q1: STAR_COLORIDX_STEP,
  },
];

/** A chunk object's file name: the bake writes it, the reader, collector and `fetch-data` resolve it. */
export function octreeChunkFileName(ref: Pick<OctreeChunkRef, 'level' | 'morton' | 'hash'>): string {
  return `${ref.level}-${ref.morton}.${ref.hash}.bin`;
}

export function starChunkPath(
  binBaseName: string,
  ref: Pick<OctreeChunkRef, 'level' | 'morton' | 'hash'>,
): string {
  return `${STAR_OCTREE_DATA_PREFIX}/${binBaseName}/${octreeChunkFileName(ref)}`;
}

export function starIndexPath(binBaseName: string): string {
  return `${STAR_OCTREE_DATA_PREFIX}/${binBaseName}.bin`;
}

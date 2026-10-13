import type { ColumnId } from '../../@types/octree/ColumnId';
import type { ColumnSchema } from '../../@types/octree/ColumnSchema';
import type { DecodedOctreeObject } from '../../@types/octree/DecodedOctreeObject';
import type { OctreeChunkHeader } from '../../@types/octree/OctreeChunkHeader';
import type { OctreeColumn } from '../../@types/octree/OctreeColumn';
import type { OctreeNodeTable } from '../../@types/octree/OctreeNodeTable';
import { f16ToFloat } from '../../utils/math/f16ToFloat';
import { roundUpToMultiple } from '../../utils/math/roundUpToMultiple';
import {
  COLUMN_STORE_BYTES,
  NODE_BLOB_COUNT_OFFSET,
  NODE_CHILD_MASK_OFFSET,
  NODE_CHUNK_REF_OFFSET,
  NODE_FIRST_RECORD_OFFSET,
  NODE_LEVEL_OFFSET,
  NODE_MORTON_OFFSET,
  NODE_OWN_COUNT_OFFSET,
  OCTREE_ALIGN,
  OCTREE_NODE_BYTES,
  PACKED_VECTOR_COMPONENTS,
  U16X3_Y_BYTE_OFFSET,
  U16X3_Z_BYTE_OFFSET,
} from './octreeFormat';

/** The node table and record columns after the framing, shared by index and chunk objects. */
export function decodeOctreeBody(
  buf: ArrayBuffer,
  nodeTableOffset: number,
  counts: { readonly nodes: number; readonly records: number },
  schema: readonly ColumnSchema[],
): Omit<DecodedOctreeObject<OctreeChunkHeader>, 'header'> {
  const dv = new DataView(buf);
  let end = nodeTableOffset + counts.nodes * OCTREE_NODE_BYTES;
  for (const c of schema) {
    end = roundUpToMultiple(end, OCTREE_ALIGN) + counts.records * COLUMN_STORE_BYTES[c.store];
  }
  if (end > buf.byteLength) {
    throw new Error(`truncated octree object: ${buf.byteLength} bytes, layout needs ${end}`);
  }

  const nodes = readNodeTable(dv, nodeTableOffset, counts.nodes);
  const columns = new Map<ColumnId, OctreeColumn>();
  let cursor = nodeTableOffset + counts.nodes * OCTREE_NODE_BYTES;
  for (const c of schema) {
    cursor = roundUpToMultiple(cursor, OCTREE_ALIGN);
    columns.set(c.id, readColumn(dv, cursor, counts.records, c));
    cursor += counts.records * COLUMN_STORE_BYTES[c.store];
  }
  return { nodes, columns };
}

function readNodeTable(dv: DataView, at: number, count: number): OctreeNodeTable {
  const t: OctreeNodeTable = {
    count,
    morton: new Uint32Array(count),
    level: new Uint8Array(count),
    childMask: new Uint8Array(count),
    firstRecord: new Uint32Array(count),
    ownCount: new Uint32Array(count),
    blobCount: new Uint32Array(count),
    chunkRef: new Uint32Array(count),
  };
  for (let i = 0; i < count; i++) {
    const b = at + i * OCTREE_NODE_BYTES;
    t.morton[i] = dv.getUint32(b + NODE_MORTON_OFFSET, true);
    t.level[i] = dv.getUint8(b + NODE_LEVEL_OFFSET);
    t.childMask[i] = dv.getUint8(b + NODE_CHILD_MASK_OFFSET);
    t.firstRecord[i] = dv.getUint32(b + NODE_FIRST_RECORD_OFFSET, true);
    t.ownCount[i] = dv.getUint32(b + NODE_OWN_COUNT_OFFSET, true);
    t.blobCount[i] = dv.getUint32(b + NODE_BLOB_COUNT_OFFSET, true);
    t.chunkRef[i] = dv.getUint32(b + NODE_CHUNK_REF_OFFSET, true);
  }
  return t;
}

function readColumn(dv: DataView, at: number, n: number, c: ColumnSchema): OctreeColumn {
  const stride = COLUMN_STORE_BYTES[c.store];
  switch (c.store) {
    case 'u16x3': {
      const out = new Uint16Array(n * PACKED_VECTOR_COMPONENTS);
      for (let i = 0; i < n; i++) {
        const b = at + i * stride;
        out[3 * i] = dv.getUint16(b, true);
        out[3 * i + 1] = dv.getUint16(b + U16X3_Y_BYTE_OFFSET, true);
        out[3 * i + 2] = dv.getUint16(b + U16X3_Z_BYTE_OFFSET, true);
      }
      return out;
    }
    case 'f32':
    case 'f16': {
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const b = at + i * stride;
        out[i] = c.store === 'f32' ? dv.getFloat32(b, true) : f16ToFloat(dv.getUint16(b, true));
      }
      return out;
    }
    default: {
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = c.q0 + readIntegerScalar(dv, at + i * stride, c.store) * c.q1;
      return out;
    }
  }
}

function readIntegerScalar(dv: DataView, at: number, store: 'u8' | 'u16' | 'u32' | 'i8'): number {
  switch (store) {
    case 'u8':
      return dv.getUint8(at);
    case 'u16':
      return dv.getUint16(at, true);
    case 'u32':
      return dv.getUint32(at, true);
    case 'i8':
      return dv.getInt8(at);
  }
}

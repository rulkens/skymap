import type { ColumnId } from '../../src/@types/octree/ColumnId';
import type { ColumnSchema } from '../../src/@types/octree/ColumnSchema';
import type { OctreeChunkHeader } from '../../src/@types/octree/OctreeChunkHeader';
import type { OctreeIndexHeader } from '../../src/@types/octree/OctreeIndexHeader';
import type { OctreeNodeTable } from '../../src/@types/octree/OctreeNodeTable';
import type { OctreeRawColumn } from '../@types/octree/OctreeRawColumn';
import { roundUpToMultiple } from '../../src/utils/math/roundUpToMultiple';
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
  OCTREE_CHUNK_MAGIC,
  OCTREE_HEADER_BYTES_OFFSET,
  OCTREE_INDEX_MAGIC,
  OCTREE_JSON_OFFSET,
  OCTREE_JSON_PAD_BYTE,
  OCTREE_NODE_BYTES,
  OCTREE_VERSION,
  OCTREE_VERSION_OFFSET,
  PACKED_VECTOR_COMPONENTS,
  U10X3_COMPONENT_MASK,
  U10X3_Y_SHIFT,
  U10X3_Z_SHIFT,
  U16X3_Y_BYTE_OFFSET,
  U16X3_Z_BYTE_OFFSET,
} from '../../src/data/octree/octreeFormat';

/** Frames one index or chunk object; `raw` holds one already-quantised array per schema column. */
export function encodeOctreeObject(
  header: OctreeIndexHeader | OctreeChunkHeader,
  nodes: OctreeNodeTable,
  columns: readonly ColumnSchema[],
  raw: ReadonlyMap<ColumnId, OctreeRawColumn>,
): Uint8Array {
  if (header.nodes !== nodes.count) {
    throw new Error(`header names ${header.nodes} nodes, table has ${nodes.count}`);
  }
  const json = new TextEncoder().encode(JSON.stringify(header));
  const nodeTableOffset = roundUpToMultiple(OCTREE_JSON_OFFSET + json.length, OCTREE_ALIGN);
  let cursor = nodeTableOffset + nodes.count * OCTREE_NODE_BYTES;
  const starts = columns.map((c) => {
    const start = roundUpToMultiple(cursor, OCTREE_ALIGN);
    cursor = start + header.records * COLUMN_STORE_BYTES[c.store];
    return start;
  });

  const out = new Uint8Array(cursor);
  const dv = new DataView(out.buffer);
  const magic = header.kind === 'index' ? OCTREE_INDEX_MAGIC : OCTREE_CHUNK_MAGIC;
  for (let i = 0; i < magic.length; i++) out[i] = magic.charCodeAt(i);
  dv.setUint16(OCTREE_VERSION_OFFSET, OCTREE_VERSION, true);
  dv.setUint32(OCTREE_HEADER_BYTES_OFFSET, nodeTableOffset - OCTREE_JSON_OFFSET, true);
  out.set(json, OCTREE_JSON_OFFSET);
  out.fill(OCTREE_JSON_PAD_BYTE, OCTREE_JSON_OFFSET + json.length, nodeTableOffset);

  for (let i = 0; i < nodes.count; i++) {
    const b = nodeTableOffset + i * OCTREE_NODE_BYTES;
    dv.setUint32(b + NODE_MORTON_OFFSET, nodes.morton[i]!, true);
    dv.setUint8(b + NODE_LEVEL_OFFSET, nodes.level[i]!);
    dv.setUint8(b + NODE_CHILD_MASK_OFFSET, nodes.childMask[i]!);
    dv.setUint32(b + NODE_FIRST_RECORD_OFFSET, nodes.firstRecord[i]!, true);
    dv.setUint32(b + NODE_OWN_COUNT_OFFSET, nodes.ownCount[i]!, true);
    dv.setUint32(b + NODE_BLOB_COUNT_OFFSET, nodes.blobCount[i]!, true);
    dv.setUint32(b + NODE_CHUNK_REF_OFFSET, nodes.chunkRef[i]!, true);
  }

  columns.forEach((c, k) => {
    const values = raw.get(c.id);
    const width = c.store === 'u10x3' || c.store === 'u16x3' ? PACKED_VECTOR_COMPONENTS : 1;
    if (values === undefined || values.length !== header.records * width) {
      throw new Error(`column ${c.id}: expected ${header.records * width} raw values`);
    }
    writeColumn(dv, starts[k]!, header.records, c, values);
  });
  return out;
}

function writeColumn(
  dv: DataView,
  at: number,
  n: number,
  c: ColumnSchema,
  values: OctreeRawColumn,
): void {
  const stride = COLUMN_STORE_BYTES[c.store];
  if (c.store === 'u64') {
    const v = values as BigUint64Array;
    for (let i = 0; i < n; i++) dv.setBigUint64(at + i * stride, v[i]!, true);
    return;
  }
  const v = values as Exclude<OctreeRawColumn, BigUint64Array>;
  for (let i = 0; i < n; i++) {
    const b = at + i * stride;
    switch (c.store) {
      case 'u10x3':
        dv.setUint32(
          b,
          (v[3 * i]! & U10X3_COMPONENT_MASK) |
            ((v[3 * i + 1]! & U10X3_COMPONENT_MASK) << U10X3_Y_SHIFT) |
            ((v[3 * i + 2]! & U10X3_COMPONENT_MASK) << U10X3_Z_SHIFT),
          true,
        );
        break;
      case 'u16x3':
        dv.setUint16(b, v[3 * i]!, true);
        dv.setUint16(b + U16X3_Y_BYTE_OFFSET, v[3 * i + 1]!, true);
        dv.setUint16(b + U16X3_Z_BYTE_OFFSET, v[3 * i + 2]!, true);
        break;
      case 'f32':
        dv.setFloat32(b, v[i]!, true);
        break;
      case 'f16':
      case 'u16':
        dv.setUint16(b, v[i]!, true);
        break;
      case 'u8':
        dv.setUint8(b, v[i]!);
        break;
      case 'u32':
        dv.setUint32(b, v[i]!, true);
        break;
      case 'i8':
        dv.setInt8(b, v[i]!);
        break;
    }
  }
}

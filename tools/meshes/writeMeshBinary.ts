/**
 * writeMeshBinary — encoder for the `.mesh` format, the exact inverse of
 * `decodeMesh` (`src/data/mesh/meshBinaryFormat.ts`, which owns the header
 * table and the constants imported here).
 *
 * The header goes through a `DataView` (mixed field widths); both payload
 * blocks are filled through typed-array views, which the 4-byte-aligned
 * header makes legal.
 */

import {
  MESH_HEADER_BYTES,
  MESH_MAGIC,
  MESH_VERSION,
  MESH_VERTEX_STRIDE_BYTES,
} from '../../src/data/mesh/meshBinaryFormat';

export function writeMeshBinary(geometry: {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly tangents: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly boundingRadiusM: number;
}): ArrayBuffer {
  const { positions, normals, tangents, uvs, indices, boundingRadiusM } = geometry;
  const vertexCount = positions.length / 3;
  const indexOffset = MESH_HEADER_BYTES + vertexCount * MESH_VERTEX_STRIDE_BYTES;
  const buf = new ArrayBuffer(indexOffset + indices.length * 4);
  const dv = new DataView(buf);

  for (let i = 0; i < 4; i++) dv.setUint8(i, MESH_MAGIC.charCodeAt(i));
  dv.setUint32(4, MESH_VERSION, true);
  dv.setUint32(8, vertexCount, true);
  dv.setUint32(12, indices.length, true);
  dv.setFloat32(16, boundingRadiusM, true);

  const vertices = new Float32Array(
    buf,
    MESH_HEADER_BYTES,
    vertexCount * (MESH_VERTEX_STRIDE_BYTES / 4),
  );
  let o = 0;
  for (let v = 0; v < vertexCount; v++) {
    for (let c = 0; c < 3; c++) vertices[o++] = positions[v * 3 + c]!;
    for (let c = 0; c < 3; c++) vertices[o++] = normals[v * 3 + c]!;
    for (let c = 0; c < 4; c++) vertices[o++] = tangents[v * 4 + c]!;
    for (let c = 0; c < 2; c++) vertices[o++] = uvs[v * 2 + c]!;
  }
  new Uint32Array(buf, indexOffset, indices.length).set(indices);

  return buf;
}

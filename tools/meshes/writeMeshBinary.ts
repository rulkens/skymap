/**
 * writeMeshBinary — encoder for the `.mesh` format, the exact inverse of
 * `decodeMesh` (`src/data/mesh/meshBinaryFormat.ts`, which owns the header
 * table and the constants imported here).
 *
 * Every payload element goes through the `DataView` for the same reason the
 * decoder reads that way: the 18-byte header is not a multiple of 4, so the
 * vertex block starts unaligned and a `Float32Array` view over it throws.
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
  const buf = new ArrayBuffer(
    MESH_HEADER_BYTES + vertexCount * MESH_VERTEX_STRIDE_BYTES + indices.length * 4,
  );
  const dv = new DataView(buf);

  for (let i = 0; i < 4; i++) dv.setUint8(i, MESH_MAGIC.charCodeAt(i));
  dv.setUint16(4, MESH_VERSION, true);
  dv.setUint32(6, vertexCount, true);
  dv.setUint32(10, indices.length, true);
  dv.setFloat32(14, boundingRadiusM, true);

  let o = MESH_HEADER_BYTES;
  for (let v = 0; v < vertexCount; v++) {
    for (let c = 0; c < 3; c++, o += 4) dv.setFloat32(o, positions[v * 3 + c]!, true);
    for (let c = 0; c < 3; c++, o += 4) dv.setFloat32(o, normals[v * 3 + c]!, true);
    for (let c = 0; c < 4; c++, o += 4) dv.setFloat32(o, tangents[v * 4 + c]!, true);
    for (let c = 0; c < 2; c++, o += 4) dv.setFloat32(o, uvs[v * 2 + c]!, true);
  }
  for (let i = 0; i < indices.length; i++, o += 4) dv.setUint32(o, indices[i]!, true);

  return buf;
}

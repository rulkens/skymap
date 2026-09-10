/**
 * meshBinaryFormat — runtime decoder for the `.mesh` baked-asset format.
 *
 * Header (little-endian, 18 bytes): magic 'SKMH' (u8×4), version (u16),
 * vertexCount (u32), indexCount (u32), boundingRadiusM (f32). Then
 * `vertexCount` interleaved vertices at 48-byte stride (pos f32×3, normal
 * f32×3, tangent f32×4 w=handedness, uv f32×2), then `indexCount` u32
 * indices. See docs/superpowers/specs/2026-09-10-mesh-bodies-design.md
 * ("`.mesh` binary format") for the authoritative table.
 *
 * LANDMINE: the 18-byte header is not a multiple of 4, so the vertex and
 * index blocks start at unaligned byte offsets — `new Float32Array(buf,
 * 18, …)` throws `RangeError`. Every payload element is read through the
 * `DataView` instead; the encoder (`writeMeshBinary`, Task 10) writes the
 * same way.
 */

import type { MeshAsset } from '../../@types/data/mesh/MeshAsset';

export const MESH_MAGIC = 'SKMH';
export const MESH_VERSION = 1;
export const MESH_HEADER_BYTES = 18;
export const MESH_VERTEX_STRIDE_BYTES = 48;

export type DecodedMeshGeometry = Omit<MeshAsset, 'albedo' | 'metalRough' | 'normalMap'>;

/**
 * Decode an ArrayBuffer to the geometry half of a `MeshAsset`. Throws on
 * bad magic or unsupported version; the version error names the rebuild
 * command so a stale `.mesh` on disk has a one-line fix.
 */
export function decodeMesh(buf: ArrayBuffer): DecodedMeshGeometry {
  const dv = new DataView(buf);

  let magic = '';
  for (let i = 0; i < 4; i++) magic += String.fromCharCode(dv.getUint8(i));
  if (magic !== MESH_MAGIC) {
    throw new Error('decodeMesh: bad magic — not a SKMH file');
  }

  const version = dv.getUint16(4, true);
  if (version !== MESH_VERSION) {
    throw new Error(
      `decodeMesh: unsupported version ${version} — please regenerate the .mesh via "npm run build-meshes"`,
    );
  }

  const vertexCount = dv.getUint32(6, true);
  const indexCount = dv.getUint32(10, true);
  const boundingRadiusM = dv.getFloat32(14, true);

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const tangents = new Float32Array(vertexCount * 4);
  const uvs = new Float32Array(vertexCount * 2);

  let o = MESH_HEADER_BYTES;
  for (let v = 0; v < vertexCount; v++) {
    for (let c = 0; c < 3; c++, o += 4) positions[v * 3 + c] = dv.getFloat32(o, true);
    for (let c = 0; c < 3; c++, o += 4) normals[v * 3 + c] = dv.getFloat32(o, true);
    for (let c = 0; c < 4; c++, o += 4) tangents[v * 4 + c] = dv.getFloat32(o, true);
    for (let c = 0; c < 2; c++, o += 4) uvs[v * 2 + c] = dv.getFloat32(o, true);
  }

  const indices = new Uint32Array(indexCount);
  for (let i = 0; i < indexCount; i++, o += 4) indices[i] = dv.getUint32(o, true);

  return { boundingRadiusM, vertexCount, indexCount, positions, normals, tangents, uvs, indices };
}

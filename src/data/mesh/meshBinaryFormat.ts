/**
 * meshBinaryFormat — runtime decoder for the `.mesh` baked-asset format.
 *
 * Header (little-endian, 20 bytes): magic 'SKMH' (u8×4), version (u32),
 * vertexCount (u32), indexCount (u32), boundingRadiusM (f32). Then
 * `vertexCount` interleaved vertices at 48-byte stride (pos f32×3, normal
 * f32×3, tangent f32×4 w=handedness, uv f32×2), then `indexCount` u32
 * indices. Header and stride are both multiples of 4, so each payload block
 * starts 4-byte aligned and is read as a typed-array view straight over the
 * file buffer. See docs/superpowers/specs/2026-09-10-mesh-bodies-design.md
 * ("`.mesh` binary format") for the authoritative table.
 */

import type { MeshAsset } from '../../@types/data/mesh/MeshAsset';

export const MESH_MAGIC = 'SKMH';
export const MESH_VERSION = 2;
export const MESH_HEADER_BYTES = 20;
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

  const version = dv.getUint32(4, true);
  if (version !== MESH_VERSION) {
    throw new Error(
      `decodeMesh: unsupported version ${version} — please regenerate the .mesh via "npm run build-meshes"`,
    );
  }

  const vertexCount = dv.getUint32(8, true);
  const indexCount = dv.getUint32(12, true);
  const boundingRadiusM = dv.getFloat32(16, true);

  // Views, not copies — little-endian host assumed, as everywhere else in the
  // loader. The renderer binds one buffer per attribute, so the interleaved
  // block is split out; the index block goes to the GPU as it lies.
  const vertices = new Float32Array(
    buf,
    MESH_HEADER_BYTES,
    vertexCount * (MESH_VERTEX_STRIDE_BYTES / 4),
  );
  const indices = new Uint32Array(
    buf,
    MESH_HEADER_BYTES + vertexCount * MESH_VERTEX_STRIDE_BYTES,
    indexCount,
  );

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const tangents = new Float32Array(vertexCount * 4);
  const uvs = new Float32Array(vertexCount * 2);

  let o = 0;
  for (let v = 0; v < vertexCount; v++) {
    for (let c = 0; c < 3; c++) positions[v * 3 + c] = vertices[o++]!;
    for (let c = 0; c < 3; c++) normals[v * 3 + c] = vertices[o++]!;
    for (let c = 0; c < 4; c++) tangents[v * 4 + c] = vertices[o++]!;
    for (let c = 0; c < 2; c++) uvs[v * 2 + c] = vertices[o++]!;
  }

  return { boundingRadiusM, vertexCount, indexCount, positions, normals, tangents, uvs, indices };
}

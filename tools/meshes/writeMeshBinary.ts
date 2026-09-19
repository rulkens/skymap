/**
 * writeMeshBinary — encoder for the `.mesh` v3 format, the exact inverse of
 * `decodeMesh` (`src/data/mesh/meshBinaryFormat.ts` owns the layout and the
 * constants imported here): reorder for the vertex cache, quantise, meshopt-encode.
 */

import { MeshoptEncoder } from 'meshoptimizer/encoder';

import {
  MESH_BOUNDING_RADIUS_OFFSET,
  MESH_HEADER_BYTES,
  MESH_HEADER_FIELD_BYTES,
  MESH_INDEX_COUNT_OFFSET,
  MESH_MAGIC,
  MESH_OCT_BITS,
  MESH_OCT_BYTES,
  MESH_POS_MIN_OFFSET,
  MESH_POS_SCALE_OFFSET,
  MESH_STREAM_ALIGN_BYTES,
  MESH_STREAM_LENGTHS_OFFSET,
  MESH_STREAMS,
  MESH_UNORM16_MAX,
  MESH_VERSION,
  MESH_VERSION_OFFSET,
  MESH_VERTEX_COUNT_OFFSET,
} from '../../src/data/mesh/meshBinaryFormat';
import { roundUpToMultiple } from '../../src/utils/math/roundUpToMultiple';

/** `reorderMesh`'s remap entry for a vertex no index references. */
const UNREFERENCED = 0xffffffff;

/** Blender's atlas pack can spill a UV this far past [0, 1]; beyond it, the UV is tiling, not a rounding spill. */
const UV_CLAMP_TOLERANCE = 0.01;

export async function writeMeshBinary(geometry: {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly tangents: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly boundingRadiusM: number;
}): Promise<ArrayBuffer> {
  const { positions, normals, tangents, boundingRadiusM } = geometry;
  // UVs are atlas coordinates; a unorm16 has nowhere to put one outside [0, 1]. A
  // near-edge spill is clamped in place; anything further out is a tiling UV.
  const uvs = Float32Array.from(geometry.uvs, (uv) => {
    if (uv >= 0 && uv <= 1) return uv;
    if (uv >= -UV_CLAMP_TOLERANCE && uv <= 1 + UV_CLAMP_TOLERANCE)
      return Math.min(1, Math.max(0, uv));
    throw new Error(`writeMeshBinary: uv ${uv} outside [0, 1] — the .mesh stores UVs as unorm16`);
  });

  await MeshoptEncoder.ready;
  // reorderMesh rewrites the indices it is handed, so it gets a copy.
  const indices = geometry.indices.slice();
  const [remap, vertexCount] = MeshoptEncoder.reorderMesh(indices, true, false);
  // Gathered in the new order; the oct filter reads 4 floats per element, so normals get w = 0.
  const pos = new Float32Array(vertexCount * 3);
  const normal4 = new Float32Array(vertexCount * 4);
  const tangent4 = new Float32Array(vertexCount * 4);
  const qUvs = new Uint16Array(vertexCount * 2);
  remap.forEach((to, from) => {
    if (to === UNREFERENCED) return;
    for (let c = 0; c < 3; c++) {
      pos[to * 3 + c] = positions[from * 3 + c]!;
      normal4[to * 4 + c] = normals[from * 3 + c]!;
    }
    for (let c = 0; c < 4; c++) tangent4[to * 4 + c] = tangents[from * 4 + c]!;
    for (let c = 0; c < 2; c++) {
      qUvs[to * 2 + c] = Math.round(uvs[from * 2 + c]! * MESH_UNORM16_MAX);
    }
  });

  // Rounded to f32 BEFORE quantising, so the decoder's f32 header values invert exactly.
  const posMin = [0, 1, 2].map((c) => {
    let min = Infinity;
    for (let v = 0; v < vertexCount; v++) min = Math.min(min, pos[v * 3 + c]!);
    return Math.fround(vertexCount > 0 ? min : 0);
  });
  const extent = Math.max(
    ...[0, 1, 2].map((c) => {
      let max = -Infinity;
      for (let v = 0; v < vertexCount; v++) max = Math.max(max, pos[v * 3 + c]!);
      return vertexCount > 0 ? max - posMin[c]! : 0;
    }),
  );
  const posScale = Math.fround(extent > 0 ? extent / MESH_UNORM16_MAX : 1);
  const qPositions = new Uint16Array(vertexCount * 4);
  for (let v = 0; v < vertexCount; v++) {
    for (let c = 0; c < 3; c++) {
      const q = Math.round((pos[v * 3 + c]! - posMin[c]!) / posScale);
      // Clamped: the f32 rounding above can nudge an extreme a hair past the range, and a u16 wraps.
      qPositions[v * 4 + c] = Math.min(MESH_UNORM16_MAX, Math.max(0, q));
    }
  }

  const raw = {
    positions: new Uint8Array(qPositions.buffer),
    normals: MeshoptEncoder.encodeFilterOct(normal4, vertexCount, MESH_OCT_BYTES, MESH_OCT_BITS),
    tangents: MeshoptEncoder.encodeFilterOct(tangent4, vertexCount, MESH_OCT_BYTES, MESH_OCT_BITS),
    uvs: new Uint8Array(qUvs.buffer),
    indices: new Uint8Array(indices.buffer),
  };
  const encoded = MESH_STREAMS.map((stream) => {
    const count = stream.mode === 'TRIANGLES' ? indices.length : vertexCount;
    return MeshoptEncoder.encodeGltfBuffer(raw[stream.name], count, stream.bytes, stream.mode);
  });

  const byteLength = encoded.reduce(
    (sum, e) => sum + roundUpToMultiple(e.length, MESH_STREAM_ALIGN_BYTES),
    MESH_HEADER_BYTES,
  );
  const buf = new ArrayBuffer(byteLength);
  const dv = new DataView(buf);
  for (let i = 0; i < MESH_MAGIC.length; i++) dv.setUint8(i, MESH_MAGIC.charCodeAt(i));
  dv.setUint32(MESH_VERSION_OFFSET, MESH_VERSION, true);
  dv.setUint32(MESH_VERTEX_COUNT_OFFSET, vertexCount, true);
  dv.setUint32(MESH_INDEX_COUNT_OFFSET, indices.length, true);
  dv.setFloat32(MESH_BOUNDING_RADIUS_OFFSET, boundingRadiusM, true);
  posMin.forEach((m, c) =>
    dv.setFloat32(MESH_POS_MIN_OFFSET + c * MESH_HEADER_FIELD_BYTES, m, true),
  );
  dv.setFloat32(MESH_POS_SCALE_OFFSET, posScale, true);

  let offset = MESH_HEADER_BYTES;
  encoded.forEach((e, i) => {
    dv.setUint32(MESH_STREAM_LENGTHS_OFFSET + i * MESH_HEADER_FIELD_BYTES, e.length, true);
    new Uint8Array(buf, offset, e.length).set(e);
    offset += roundUpToMultiple(e.length, MESH_STREAM_ALIGN_BYTES);
  });
  return buf;
}

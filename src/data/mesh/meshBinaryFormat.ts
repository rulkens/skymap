/**
 * meshBinaryFormat — the `.mesh` v3 byte layout and its runtime decoder.
 * `writeMeshBinary` is the inverse. Spec:
 * docs/superpowers/specs/completed/2026-09-19-mesh-meshopt-encoding-design.md ("Data
 * delta"). The GPU still gets v2's float32 arrays: quantisation is wire-only.
 */

import { MeshoptDecoder } from 'meshoptimizer/decoder';

import type { MeshAsset } from '../../@types/data/mesh/MeshAsset';
import { roundUpToMultiple } from '../../utils/math/roundUpToMultiple';

export const MESH_MAGIC = 'SKMH';
export const MESH_VERSION = 3;

// Header, little-endian. Every field is 4 bytes wide, so the streams start aligned.
export const MESH_HEADER_FIELD_BYTES = 4;
export const MESH_VERSION_OFFSET = 4;
export const MESH_VERTEX_COUNT_OFFSET = 8;
export const MESH_INDEX_COUNT_OFFSET = 12;
export const MESH_BOUNDING_RADIUS_OFFSET = 16;
export const MESH_POS_MIN_OFFSET = 20; // f32×3
export const MESH_POS_SCALE_OFFSET = 32; // metres per position step, one isotropic scale
export const MESH_STREAM_LENGTHS_OFFSET = 36; // u32 per MESH_STREAMS row: the encoded, unpadded length
export const MESH_HEADER_BYTES = 56;

/** Each stream starts on this boundary; the gap after a shorter one is zero padding. */
export const MESH_STREAM_ALIGN_BYTES = 4;

/** Positions and UVs are unorm16; the octahedral filter decodes to snorm16. */
export const MESH_UNORM16_MAX = 65535;
const MESH_SNORM16_MAX = 32767;
export const MESH_OCT_BITS = 10;
/** An octahedral element: i16×4, xyz then w (0 for a normal, handedness for a tangent). */
export const MESH_OCT_BYTES = 8;
/** A position element: u16×4, w = 0 padding — meshopt wants a 4-byte-multiple element. */
const MESH_POS_BYTES = 8;
const MESH_UV_BYTES = 4;
const MESH_INDEX_BYTES = 4;

/**
 * The streams in file order (the order is the format; nothing in the file names
 * them). Attribute streams hold `vertexCount` elements, the index stream
 * `indexCount`.
 */
export const MESH_STREAMS = [
  { name: 'positions', bytes: MESH_POS_BYTES, mode: 'ATTRIBUTES', filter: 'NONE' },
  { name: 'normals', bytes: MESH_OCT_BYTES, mode: 'ATTRIBUTES', filter: 'OCTAHEDRAL' },
  { name: 'tangents', bytes: MESH_OCT_BYTES, mode: 'ATTRIBUTES', filter: 'OCTAHEDRAL' },
  { name: 'uvs', bytes: MESH_UV_BYTES, mode: 'ATTRIBUTES', filter: 'NONE' },
  { name: 'indices', bytes: MESH_INDEX_BYTES, mode: 'TRIANGLES', filter: 'NONE' },
] as const;

export type DecodedMeshGeometry = Omit<MeshAsset, 'albedo' | 'metalRough' | 'normalMap'>;

/** Octahedral output back to float: xyz renormalised; w (tangents only) snapped to ±1. */
function unpackOct(q: Int16Array, count: number, out: Float32Array, withSign: boolean): void {
  const stride = withSign ? 4 : 3;
  for (let v = 0; v < count; v++) {
    const x = q[v * 4]! / MESH_SNORM16_MAX;
    const y = q[v * 4 + 1]! / MESH_SNORM16_MAX;
    const z = q[v * 4 + 2]! / MESH_SNORM16_MAX;
    const inv = 1 / Math.sqrt(x * x + y * y + z * z);
    out[v * stride] = x * inv;
    out[v * stride + 1] = y * inv;
    out[v * stride + 2] = z * inv;
    if (withSign) out[v * stride + 3] = q[v * 4 + 3]! < 0 ? -1 : 1;
  }
}

/**
 * Decode an ArrayBuffer to the geometry half of a `MeshAsset`. Throws on bad
 * magic or any version but v3; the version error names the rebuild command so a
 * stale `.mesh` on disk has a one-line fix.
 */
export async function decodeMesh(buf: ArrayBuffer): Promise<DecodedMeshGeometry> {
  const dv = new DataView(buf);

  let magic = '';
  for (let i = 0; i < MESH_MAGIC.length; i++) magic += String.fromCharCode(dv.getUint8(i));
  if (magic !== MESH_MAGIC) {
    throw new Error('decodeMesh: bad magic — not a SKMH file');
  }

  const version = dv.getUint32(MESH_VERSION_OFFSET, true);
  if (version !== MESH_VERSION) {
    throw new Error(
      `decodeMesh: unsupported version ${version} — please regenerate the .mesh via "npm run build-meshes"`,
    );
  }

  const vertexCount = dv.getUint32(MESH_VERTEX_COUNT_OFFSET, true);
  const indexCount = dv.getUint32(MESH_INDEX_COUNT_OFFSET, true);
  const boundingRadiusM = dv.getFloat32(MESH_BOUNDING_RADIUS_OFFSET, true);
  const posMin = [0, 1, 2].map((c) =>
    dv.getFloat32(MESH_POS_MIN_OFFSET + c * MESH_HEADER_FIELD_BYTES, true),
  );
  const posScale = dv.getFloat32(MESH_POS_SCALE_OFFSET, true);

  await MeshoptDecoder.ready;
  let offset = MESH_HEADER_BYTES;
  const [qPosBytes, qNormalBytes, qTangentBytes, qUvBytes, indexBytes] = MESH_STREAMS.map(
    (stream, i) => {
      const lengthAt = MESH_STREAM_LENGTHS_OFFSET + i * MESH_HEADER_FIELD_BYTES;
      const byteLength = dv.getUint32(lengthAt, true);
      const count = stream.mode === 'TRIANGLES' ? indexCount : vertexCount;
      const target = new Uint8Array(count * stream.bytes);
      const source = new Uint8Array(buf, offset, byteLength);
      MeshoptDecoder.decodeGltfBuffer(
        target,
        count,
        stream.bytes,
        source,
        stream.mode,
        stream.filter,
      );
      offset += roundUpToMultiple(byteLength, MESH_STREAM_ALIGN_BYTES);
      return target.buffer;
    },
  );

  const qPositions = new Uint16Array(qPosBytes!);
  const qUvs = new Uint16Array(qUvBytes!);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const tangents = new Float32Array(vertexCount * 4);
  const uvs = new Float32Array(vertexCount * 2);
  for (let v = 0; v < vertexCount; v++) {
    for (let c = 0; c < 3; c++) {
      positions[v * 3 + c] = posMin[c]! + qPositions[v * 4 + c]! * posScale;
    }
    for (let c = 0; c < 2; c++) uvs[v * 2 + c] = qUvs[v * 2 + c]! / MESH_UNORM16_MAX;
  }
  unpackOct(new Int16Array(qNormalBytes!), vertexCount, normals, false);
  unpackOct(new Int16Array(qTangentBytes!), vertexCount, tangents, true);
  const indices = new Uint32Array(indexBytes!);

  return { boundingRadiusM, vertexCount, indexCount, positions, normals, tangents, uvs, indices };
}

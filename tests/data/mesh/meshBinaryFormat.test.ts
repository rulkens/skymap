import { describe, it, expect } from 'vitest';
import {
  decodeMesh,
  MESH_MAGIC,
  MESH_VERSION,
  MESH_HEADER_BYTES,
  MESH_VERTEX_STRIDE_BYTES,
} from '../../../src/data/mesh/meshBinaryFormat';

type FixtureVertex = {
  pos: [number, number, number];
  normal: [number, number, number];
  tangent: [number, number, number, number];
  uv: [number, number];
};

const FIXTURE_VERTICES: FixtureVertex[] = [
  { pos: [1, 2, 3], normal: [0, 0, 1], tangent: [1, 0, 0, 1], uv: [0, 0] },
  { pos: [4, 5, 6], normal: [0, 1, 0], tangent: [0, 1, 0, -1], uv: [1, 0] },
  { pos: [7, 8, 9], normal: [1, 0, 0], tangent: [0, 0, 1, 1], uv: [0, 1] },
];
const FIXTURE_INDICES = [0, 1, 2];
const FIXTURE_BOUNDING_RADIUS_M = 12.5;

// Hand-built with a DataView — the same unaligned-offset discipline
// `decodeMesh` itself must use (see the header-alignment landmine below).
// No `writeMeshBinary` exists yet at this point in the plan's execution
// order (Task 10), so this is the only source of truth for a valid buffer.
function buildFixtureBuffer(magic = MESH_MAGIC, version = MESH_VERSION): ArrayBuffer {
  const vertexCount = FIXTURE_VERTICES.length;
  const indexCount = FIXTURE_INDICES.length;
  const byteLength = MESH_HEADER_BYTES + vertexCount * MESH_VERTEX_STRIDE_BYTES + indexCount * 4;
  const buf = new ArrayBuffer(byteLength);
  const dv = new DataView(buf);

  let o = 0;
  for (let i = 0; i < 4; i++) dv.setUint8(o++, magic.charCodeAt(i));
  dv.setUint16(o, version, true);
  o += 2;
  dv.setUint32(o, vertexCount, true);
  o += 4;
  dv.setUint32(o, indexCount, true);
  o += 4;
  dv.setFloat32(o, FIXTURE_BOUNDING_RADIUS_M, true);
  o += 4;

  for (const v of FIXTURE_VERTICES) {
    for (const c of [...v.pos, ...v.normal, ...v.tangent, ...v.uv]) {
      dv.setFloat32(o, c, true);
      o += 4;
    }
  }
  for (const idx of FIXTURE_INDICES) {
    dv.setUint32(o, idx, true);
    o += 4;
  }

  return buf;
}

describe('mesh binary format (SKMH v1)', () => {
  it('rejects a bad magic', () => {
    const buf = new ArrayBuffer(MESH_HEADER_BYTES);
    expect(() => decodeMesh(buf)).toThrow(/magic/);
  });

  it('rejects an unsupported version', () => {
    const buf = buildFixtureBuffer(MESH_MAGIC, 99);
    expect(() => decodeMesh(buf)).toThrow(/version/);
    expect(() => decodeMesh(buf)).toThrow(/build-meshes/);
  });

  it('recovers a hand-built fixture buffer', () => {
    const decoded = decodeMesh(buildFixtureBuffer());

    expect(decoded.vertexCount).toBe(3);
    expect(decoded.indexCount).toBe(3);
    expect(decoded.boundingRadiusM).toBeCloseTo(FIXTURE_BOUNDING_RADIUS_M);

    expect(decoded.positions.length).toBe(3 * 3);
    expect(decoded.normals.length).toBe(3 * 3);
    expect(decoded.tangents.length).toBe(3 * 4);
    expect(decoded.uvs.length).toBe(3 * 2);
    expect(decoded.indices.length).toBe(3);

    // Middle vertex's position, de-interleaved into the contiguous array —
    // catches an off-by-stride error that a length-only check would miss.
    expect(Array.from(decoded.positions.slice(3, 6))).toEqual([4, 5, 6]);
    expect(decoded.tangents[3]).toBe(1); // vertex 0 tangent.w (handedness)
    expect(decoded.indices[2]).toBe(2);
  });
});

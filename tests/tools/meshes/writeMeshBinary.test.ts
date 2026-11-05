import { describe, it, expect } from 'vitest';

import { decodeMesh, MESH_UNORM16_MAX } from '../../../src/data/mesh/meshBinaryFormat';
import { writeMeshBinary } from '../../../tools/meshes/writeMeshBinary';
import { expectDirectionNear } from '../../helpers/meshes/expectDirectionNear';
import { expectPositionNear } from '../../helpers/meshes/expectPositionNear';
import { nearestVertex } from '../../helpers/meshes/nearestVertex';

const UV_TOLERANCE = 0.5 / MESH_UNORM16_MAX + 1e-7;

function quad() {
  // Off-axis unit normal/tangent pair (n·t = 0), reused across vertices with
  // alternating tangent handedness so both signs of w round-trip.
  const n = [1, 2, 2].map((c) => c / 3);
  const t = [2, -2, 1].map((c) => c / 3);
  return {
    // Off the quantisation grid: no vertex sits at every axis's min/max at once.
    positions: new Float32Array([0.3, 0.7, 0.2, 1.4, 0.1, 0.6, 0.15, 1.35, 0.05, 1.25, 1.45, 0.35]),
    normals: new Float32Array([...n, ...n, ...n, ...n]),
    tangents: new Float32Array([...t, 1, ...t, -1, ...t, 1, ...t, -1]),
    uvs: new Float32Array([0.12, 0.34, 0.81, 0.09, 0.27, 0.88, 0.63, 0.55]),
    indices: new Uint32Array([0, 1, 2, 2, 1, 3]),
    boundingRadiusM: 6.5,
  };
}

function vec(a: Float32Array, i: number, n: number): number[] {
  return Array.from(a.subarray(i * n, i * n + n));
}

/** Each triangle rotated to start at its smallest vertex id: the codec may rotate, never re-wind. */
function triangleSet(indices: Uint32Array, id: (v: number) => number): Set<string> {
  const out = new Set<string>();
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [0, 1, 2].map((k) => id(indices[t + k]!));
    const start = tri.indexOf(Math.min(...tri));
    out.add([0, 1, 2].map((k) => tri[(start + k) % 3]).join(','));
  }
  return out;
}

describe('writeMeshBinary()', () => {
  it('round-trips a quad with tangents within quantisation bounds', async () => {
    const geometry = quad();
    const buf = await writeMeshBinary(geometry);
    const decoded = await decodeMesh(buf);

    expect(decoded.vertexCount).toBe(4);
    expect(decoded.indexCount).toBe(6);
    expect(decoded.boundingRadiusM).toBe(6.5);

    // The writer reorders vertices; each decoded one is paired with its source by position.
    const sourceOf = Array.from({ length: decoded.vertexCount }, (_, v) =>
      nearestVertex(geometry.positions, vec(decoded.positions, v, 3)),
    );
    expect(new Set(sourceOf).size).toBe(4);
    expect(triangleSet(decoded.indices, (v) => sourceOf[v]!)).toEqual(
      triangleSet(geometry.indices, (v) => v),
    );

    sourceOf.forEach((s, v) => {
      expectPositionNear(buf, vec(decoded.positions, v, 3), vec(geometry.positions, s, 3));
      expectDirectionNear(vec(decoded.normals, v, 3), vec(geometry.normals, s, 3));
      expectDirectionNear(vec(decoded.tangents, v, 4), vec(geometry.tangents, s, 4));
      vec(decoded.uvs, v, 2).forEach((c, k) =>
        expect(Math.abs(c - geometry.uvs[s * 2 + k]!)).toBeLessThanOrEqual(UV_TOLERANCE),
      );
    });
  });

  it('throws on a uv outside [0, 1]', async () => {
    const geometry = { ...quad(), uvs: new Float32Array([0, 0, 1.5, 0, 0, 1, 1, 1]) };
    await expect(writeMeshBinary(geometry)).rejects.toThrow(/outside \[0, 1\]/);
  });

  it('clamps a UV within the atlas-pack spill tolerance into [0, 1]', async () => {
    // Source vertex 1's uv is the only one with a spilled u.
    const geometry = { ...quad(), uvs: new Float32Array([0, 0, 1.003, 0, 0, 1, 1, 1]) };
    const decoded = await decodeMesh(await writeMeshBinary(geometry));
    const v = nearestVertex(decoded.positions, vec(geometry.positions, 1, 3));
    expect(vec(decoded.uvs, v, 2)[0]).toBeCloseTo(1, 3);
  });
});

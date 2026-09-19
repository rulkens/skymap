import { describe, it, expect } from 'vitest';

import { decodeMesh, MESH_UNORM16_MAX } from '../../../src/data/mesh/meshBinaryFormat';
import { writeMeshBinary } from '../../../tools/meshes/writeMeshBinary';
import { expectDirectionNear } from '../../helpers/meshes/expectDirectionNear';
import { expectPositionNear } from '../../helpers/meshes/expectPositionNear';

const UV_TOLERANCE = 0.5 / MESH_UNORM16_MAX + 1e-7;

function quad() {
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0]),
    tangents: new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, -1, 0, 0, 1, -1]),
    uvs: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
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
    const sourceOf = Array.from({ length: decoded.vertexCount }, (_, v) => {
      const p = vec(decoded.positions, v, 3);
      const dists = [0, 1, 2, 3].map((s) =>
        Math.hypot(...p.map((c, k) => c - geometry.positions[s * 3 + k]!)),
      );
      return dists.indexOf(Math.min(...dists));
    });
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
    const geometry = { ...quad(), uvs: new Float32Array([0, 0, 1.01, 0, 0, 1, 1, 1]) };
    await expect(writeMeshBinary(geometry)).rejects.toThrow(/outside \[0, 1\]/);
  });

  it('encodes a 10k-vertex grid to under a third of the v2 size', async () => {
    // The guard against a stream silently shipping unquantised. Jittered on
    // purpose: meshopt squeezes a smooth grid so hard that even float32
    // normals would pass; with noise, float32 normals or tangents alone trip it.
    const hash = (k: number) => {
      const x = Math.sin(k * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };
    const side = 100;
    const vertexCount = side * side;
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const tangents = new Float32Array(vertexCount * 4);
    const uvs = new Float32Array(vertexCount * 2);
    for (let j = 0; j < side; j++) {
      for (let i = 0; i < side; i++) {
        const v = j * side + i;
        const [u, w] = [i / (side - 1), j / (side - 1)];
        const [azimuth, ny] = [2 * Math.PI * hash(v), 0.5 + 0.5 * hash(v + vertexCount)];
        const r = Math.sqrt(1 - ny * ny);
        positions.set(
          [u * 10 + 0.05 * hash(v + 2 * vertexCount), 0.5 * hash(v + 3 * vertexCount), w * 10],
          v * 3,
        );
        normals.set([r * Math.cos(azimuth), ny, r * Math.sin(azimuth)], v * 3);
        tangents.set([-Math.sin(azimuth), 0, Math.cos(azimuth), 1], v * 4);
        uvs.set([u, w], v * 2);
      }
    }
    const indices: number[] = [];
    for (let j = 0; j < side - 1; j++) {
      for (let i = 0; i < side - 1; i++) {
        const v = j * side + i;
        indices.push(v, v + side, v + 1, v + 1, v + side, v + side + 1);
      }
    }
    const geometry = {
      positions,
      normals,
      tangents,
      uvs,
      indices: new Uint32Array(indices),
      boundingRadiusM: 8,
    };

    const buf = await writeMeshBinary(geometry);
    const v2Bytes = 20 + 48 * vertexCount + 4 * indices.length;
    expect(buf.byteLength).toBeLessThan(v2Bytes / 3);
  });
});

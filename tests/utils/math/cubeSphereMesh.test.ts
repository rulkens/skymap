import { describe, it, expect } from 'vitest';
import { cubeSphereMesh } from '../../../src/utils/math/cubeSphereMesh';
import type { CubeSphereMesh } from '../../../src/@types/math/CubeSphereMesh';

// All six faces at level 0 (whole face, tileX/tileY = 0).
const allFaces = (resolution: number): CubeSphereMesh[] =>
  [0, 1, 2, 3, 4, 5].map((face) => cubeSphereMesh(face, 0, 0, 0, resolution));

const pos = (m: CubeSphereMesh, i: number): [number, number, number] => [
  m.positions[i * 3] as number,
  m.positions[i * 3 + 1] as number,
  m.positions[i * 3 + 2] as number,
];

// Find the vertex whose position is nearest `target`, returning its index.
// (Seam duplication can create several vertices at one position; the nearest
// search returns the lowest-index one, i.e. the original grid vertex.)
const nearestVertex = (m: CubeSphereMesh, target: [number, number, number]): number => {
  let best = 0;
  let bestD = Infinity;
  const n = m.positions.length / 3;
  for (let i = 0; i < n; i++) {
    const [x, y, z] = pos(m, i);
    const d = (x - target[0]) ** 2 + (y - target[1]) ** 2 + (z - target[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
};

describe('cubeSphereMesh', () => {
  it('every position is unit length', () => {
    for (const m of allFaces(8)) {
      const n = m.positions.length / 3;
      for (let i = 0; i < n; i++) {
        const [x, y, z] = pos(m, i);
        expect(Math.hypot(x, y, z)).toBeCloseTo(1);
      }
    }
  });

  it('winding is outward-facing (first triangle normal points away from origin) on every face', () => {
    for (const m of allFaces(8)) {
      const i0 = m.indices[0] as number;
      const i1 = m.indices[1] as number;
      const i2 = m.indices[2] as number;
      const [ax, ay, az] = pos(m, i0);
      const [bx, by, bz] = pos(m, i1);
      const [cx, cy, cz] = pos(m, i2);

      const e1x = bx - ax;
      const e1y = by - ay;
      const e1z = bz - az;
      const e2x = cx - ax;
      const e2y = cy - ay;
      const e2z = cz - az;

      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;

      const centX = (ax + bx + cx) / 3;
      const centY = (ay + by + cy) / 3;
      const centZ = (az + bz + cz) / 3;

      expect(nx * centX + ny * centY + nz * centZ).toBeGreaterThan(0);
    }
  });

  it('tangents are unit length and perpendicular to the surface normal', () => {
    for (const m of allFaces(8)) {
      const n = m.positions.length / 3;
      for (let i = 0; i < n; i++) {
        const tx = m.tangents[i * 3] as number;
        const ty = m.tangents[i * 3 + 1] as number;
        const tz = m.tangents[i * 3 + 2] as number;
        expect(Math.hypot(tx, ty, tz)).toBeCloseTo(1);

        // normal is the radial direction (position is already unit length)
        const [x, y, z] = pos(m, i);
        expect(tx * x + ty * y + tz * z).toBeCloseTo(0);
      }
    }
  });

  it('equirect uv matches the J2000 convention at face centres', () => {
    // +x face centre ≈ (1,0,0): lon 0 → u 0, lat 0 → v 0.5
    const px = cubeSphereMesh(0, 0, 0, 0, 8);
    const cxi = nearestVertex(px, [1, 0, 0]);
    expect(pos(px, cxi)[0]).toBeCloseTo(1);
    expect(px.uvs[cxi * 2] as number).toBeCloseTo(0);
    expect(px.uvs[cxi * 2 + 1] as number).toBeCloseTo(0.5);

    // +y face centre ≈ (0,1,0): lon 90° → u 0.25
    const py = cubeSphereMesh(2, 0, 0, 0, 8);
    const cyi = nearestVertex(py, [0, 1, 0]);
    expect(pos(py, cyi)[1]).toBeCloseTo(1);
    expect(py.uvs[cyi * 2] as number).toBeCloseTo(0.25);

    // +z face centre ≈ (0,0,1): lat +90° → v 1
    const pz = cubeSphereMesh(4, 0, 0, 0, 8);
    const czi = nearestVertex(pz, [0, 0, 1]);
    expect(pos(pz, czi)[2]).toBeCloseTo(1);
    expect(pz.uvs[czi * 2 + 1] as number).toBeCloseTo(1);
  });

  it('no triangle spans more than half the u range on any face (seam is continuous)', () => {
    for (const m of allFaces(8)) {
      const triCount = m.indices.length / 3;
      for (let t = 0; t < triCount; t++) {
        const a = m.indices[t * 3] as number;
        const b = m.indices[t * 3 + 1] as number;
        const c = m.indices[t * 3 + 2] as number;
        const ua = m.uvs[a * 2] as number;
        const ub = m.uvs[b * 2] as number;
        const uc = m.uvs[c * 2] as number;
        const span = Math.max(ua, ub, uc) - Math.min(ua, ub, uc);
        // Pole cells legitimately reach exactly 0.5; a seam-wrap bug reaches ~1.0.
        expect(span).toBeLessThanOrEqual(0.5 + 1e-6);
      }
    }
  });
});

import { describe, it, expect } from 'vitest';
import { uvSphereMesh } from '../../../src/utils/math/uvSphereMesh';

describe('uvSphereMesh', () => {
  it('vertex count is (segments+1)*(rings+1)', () => {
    const segments = 16;
    const rings = 8;
    const { positions } = uvSphereMesh(segments, rings);
    expect(positions.length / 3).toBe((segments + 1) * (rings + 1));
  });

  it('every position is unit length', () => {
    const { positions } = uvSphereMesh(12, 6);
    const vertexCount = positions.length / 3;
    for (let i = 0; i < vertexCount; i++) {
      const x = positions[i * 3] as number;
      const y = positions[i * 3 + 1] as number;
      const z = positions[i * 3 + 2] as number;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1);
    }
  });

  it('index count is segments*rings*6', () => {
    const segments = 16;
    const rings = 8;
    const { indices } = uvSphereMesh(segments, rings);
    expect(indices.length).toBe(segments * rings * 6);
  });

  it('equatorial J2000 axes: north pole +z, south pole -z, equator lon0 +x, lon90 +y', () => {
    const segments = 12;
    const rings = 6;
    const { positions } = uvSphereMesh(segments, rings);
    const row = segments + 1;
    const at = (r: number, s: number): [number, number, number] => {
      const i = (r * row + s) * 3;
      return [positions[i] as number, positions[i + 1] as number, positions[i + 2] as number];
    };

    // Ring 0 = south pole = -z; ring `rings` = north pole = +z.
    const [sx, sy, sz] = at(0, 0);
    expect(sx).toBeCloseTo(0);
    expect(sy).toBeCloseTo(0);
    expect(sz).toBeCloseTo(-1);

    const [nx, ny, nz] = at(rings, 0);
    expect(nx).toBeCloseTo(0);
    expect(ny).toBeCloseTo(0);
    expect(nz).toBeCloseTo(1);

    // Equator ring (rings/2, lat=0). lon 0 -> +x (vernal equinox); lon 90° -> +y.
    const eqRing = rings / 2;
    const [ex, ey, ez] = at(eqRing, 0);
    expect(ex).toBeCloseTo(1);
    expect(ey).toBeCloseTo(0);
    expect(ez).toBeCloseTo(0);

    const [qx, qy, qz] = at(eqRing, segments / 4); // lon = 2π·(1/4) = π/2
    expect(qx).toBeCloseTo(0);
    expect(qy).toBeCloseTo(1);
    expect(qz).toBeCloseTo(0);
  });

  it('winding is outward-facing (geometric normal points away from origin)', () => {
    const { positions, indices } = uvSphereMesh(12, 6);

    // Spot-check the first triangle.
    const i0 = indices[0] as number;
    const i1 = indices[1] as number;
    const i2 = indices[2] as number;

    const ax = positions[i0 * 3] as number;
    const ay = positions[i0 * 3 + 1] as number;
    const az = positions[i0 * 3 + 2] as number;

    const bx = positions[i1 * 3] as number;
    const by = positions[i1 * 3 + 1] as number;
    const bz = positions[i1 * 3 + 2] as number;

    const cx = positions[i2 * 3] as number;
    const cy = positions[i2 * 3 + 1] as number;
    const cz = positions[i2 * 3 + 2] as number;

    // Edge vectors
    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;

    // Cross product = geometric normal (CCW → outward for a convex shape)
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    // Centroid of the triangle
    const centX = (ax + bx + cx) / 3;
    const centY = (ay + by + cy) / 3;
    const centZ = (az + bz + cz) / 3;

    // Dot of normal with centroid: positive means normal points away from origin
    const dot = nx * centX + ny * centY + nz * centZ;
    expect(dot).toBeGreaterThan(0);
  });

  it('uv ranges are within [0,1]', () => {
    const { uvs } = uvSphereMesh(12, 6);
    const vertexCount = uvs.length / 2;
    for (let i = 0; i < vertexCount; i++) {
      const u = uvs[i * 2] as number;
      const v = uvs[i * 2 + 1] as number;
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

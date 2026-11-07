/**
 * uvSphereGeometry feeds the mesh renderer straight, with no bake to catch a bad frame: a
 * non-unit normal or a tangent off the surface shades wrong, an index past the buffer reads
 * garbage, and a degenerate triangle is a NaN normal waiting to happen.
 */

import { describe, expect, it } from 'vitest';
import { uvSphereGeometry } from '../../../src/utils/meshBodies/uvSphereGeometry';

const RADIUS_M = 25;
const SEGMENTS = 16;
const RINGS = 8;
const g = uvSphereGeometry(RADIUS_M, SEGMENTS, RINGS);

function vec(array: Float32Array, i: number, stride: number): number[] {
  return Array.from(array.subarray(i * stride, i * stride + 3));
}

describe('uvSphereGeometry', () => {
  it('sizes every stream for its vertex count', () => {
    expect(g.vertexCount).toBe((SEGMENTS + 1) * (RINGS + 1));
    expect(g.positions).toHaveLength(g.vertexCount * 3);
    expect(g.normals).toHaveLength(g.vertexCount * 3);
    expect(g.tangents).toHaveLength(g.vertexCount * 4);
    expect(g.uvs).toHaveLength(g.vertexCount * 2);
    expect(g.boundingRadiusM).toBe(RADIUS_M);
  });

  it('puts every vertex on the sphere, its normal unit and outward, its tangent unit and on the surface', () => {
    for (let i = 0; i < g.vertexCount; i++) {
      const p = vec(g.positions, i, 3);
      const n = vec(g.normals, i, 3);
      const t = vec(g.tangents, i, 4);
      expect(Math.hypot(...p)).toBeCloseTo(RADIUS_M, 4);
      expect(Math.hypot(...n)).toBeCloseTo(1, 6);
      expect(Math.hypot(...t)).toBeCloseTo(1, 6);
      expect(p[0]! * n[0]! + p[1]! * n[1]! + p[2]! * n[2]!).toBeCloseTo(RADIUS_M, 4);
      expect(t[0]! * n[0]! + t[1]! * n[1]! + t[2]! * n[2]!).toBeCloseTo(0, 6);
      expect(Math.abs(g.tangents[i * 4 + 3]!)).toBe(1);
    }
  });

  it('indexes whole triangles inside the vertex buffer, none of them degenerate', () => {
    // Two triangles per quad, less one per quad on each pole row.
    expect(g.indexCount).toBe(6 * SEGMENTS * (RINGS - 1));
    expect(g.indices).toHaveLength(g.indexCount);
    for (let i = 0; i < g.indexCount; i += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => vec(g.positions, g.indices[i + k]!, 3));
      const ab = a!.map((x, k) => b![k]! - x);
      const ac = a!.map((x, k) => c![k]! - x);
      const area = Math.hypot(
        ab[1]! * ac[2]! - ab[2]! * ac[1]!,
        ab[2]! * ac[0]! - ab[0]! * ac[2]!,
        ab[0]! * ac[1]! - ab[1]! * ac[0]!,
      );
      expect(area).toBeGreaterThan(1e-6);
    }
    expect(Math.max(...g.indices)).toBeLessThan(g.vertexCount);
  });
});

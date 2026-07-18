/**
 * annulusMesh — geometric-property tests for the flat ring mesh.
 *
 * The assertions are hand-checkable geometry, not a vertex-list restatement:
 * every vertex sits between the inner and outer radius, the extremes hit the
 * two radii exactly, all vertices lie in the z = 0 plane, and the radial `u`
 * tracks radius monotonically across [0, 1]. Those are the properties the
 * renderer and the strip sample depend on; a topology/parameterisation bug
 * (wrong radius, tilted plane, mis-mapped u) fails one of them.
 */

import { describe, it, expect } from 'vitest';
import { annulusMesh } from '../../../src/utils/math/annulusMesh';

describe('annulusMesh', () => {
  it('spans the ratio: every vertex radius in [innerRatio, 1], extremes exact, all in z = 0', () => {
    const innerRatio = 0.53;
    const mesh = annulusMesh(64, innerRatio);
    const n = mesh.positions.length / 3;

    let minR = Infinity;
    let maxR = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = mesh.positions[i * 3]!;
      const y = mesh.positions[i * 3 + 1]!;
      const z = mesh.positions[i * 3 + 2]!;
      // Flat ring: the annulus lives in the local equatorial plane.
      expect(z).toBe(0);
      const r = Math.hypot(x, y);
      expect(r).toBeGreaterThanOrEqual(innerRatio - 1e-6);
      expect(r).toBeLessThanOrEqual(1 + 1e-6);
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
    }
    // The two rings sit exactly on the inner and outer radii.
    expect(minR).toBeCloseTo(innerRatio);
    expect(maxR).toBeCloseTo(1);
  });

  it('maps radial u monotonically with radius: inner edge → 0, outer edge → 1', () => {
    const innerRatio = 0.4;
    const mesh = annulusMesh(32, innerRatio);
    const n = mesh.positions.length / 3;

    for (let i = 0; i < n; i++) {
      const r = Math.hypot(mesh.positions[i * 3]!, mesh.positions[i * 3 + 1]!);
      const u = mesh.uvs[i * 2]!;
      // Normalized radius: u recovers (r - inner)/(1 - inner). The inner ring
      // (r = innerRatio) reads 0, the outer ring (r = 1) reads 1, and u rises
      // with r in between — the monotonic radial parameterisation the strip
      // sample rides.
      const expectedU = (r - innerRatio) / (1 - innerRatio);
      expect(u).toBeCloseTo(expectedU);
    }
    // Both extremes are present.
    const us = Array.from(mesh.uvs.filter((_, i) => i % 2 === 0));
    expect(Math.min(...us)).toBeCloseTo(0);
    expect(Math.max(...us)).toBeCloseTo(1);
  });

  it('indexes two triangles per segment quad, all indices in range', () => {
    const segments = 16;
    const mesh = annulusMesh(segments, 0.5);
    expect(mesh.indices.length).toBe(segments * 6);
    const vertexCount = mesh.positions.length / 3;
    for (const idx of mesh.indices) {
      expect(idx).toBeLessThan(vertexCount);
    }
  });
});

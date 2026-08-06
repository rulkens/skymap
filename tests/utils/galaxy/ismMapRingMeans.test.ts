/**
 * sfMapRingMeans — the row-major (ring, az) indexing this walks is exactly
 * the kind of thing that silently breaks: an off-by-`az` stride would blend
 * two rings' means together with no type error and no crash, just a wrong
 * radial envelope every placement/debug-view read downstream of it.
 */
import { describe, it, expect } from 'vitest';

import type { GalaxySfMap } from '../../../src/@types/galaxy/GalaxyIsmMap';
import { sfMapRingMeans } from '../../../src/utils/galaxy/ismMapRingMeans';

function makeMap(rings: number, az: number, dustAt: (ring: number, azIdx: number) => number): GalaxySfMap {
  const data = new Float32Array(rings * az * 4);
  for (let ring = 0; ring < rings; ring++) {
    for (let azIdx = 0; azIdx < az; azIdx++) {
      data[(ring * az + azIdx) * 4 + 3] = dustAt(ring, azIdx);
    }
  }
  return { az, rings, rMin: 1, rMax: 10, data };
}

describe('sfMapRingMeans', () => {
  it('averages each ring independently, not blended across ring boundaries', () => {
    // Ring 0 constant at 2, ring 1 constant at 8 — a stride bug would leak
    // ring 1's mass into ring 0's mean (or vice-versa) and both means would
    // drift off their true, exact values.
    const map = makeMap(2, 4, (ring) => (ring === 0 ? 2 : 8));
    const means = sfMapRingMeans(map, (texel) => texel.dust);
    expect(means[0]).toBe(2);
    expect(means[1]).toBe(8);
  });

  it('averages a non-uniform ring correctly', () => {
    const map = makeMap(1, 4, (_ring, azIdx) => azIdx); // 0, 1, 2, 3
    const means = sfMapRingMeans(map, (texel) => texel.dust);
    expect(means[0]).toBe(1.5); // (0+1+2+3)/4
  });

  it('returns one entry per ring, all zero for an all-zero map', () => {
    const map = makeMap(5, 8, () => 0);
    const means = sfMapRingMeans(map, (texel) => texel.dust);
    expect(means.length).toBe(5);
    expect([...means]).toEqual([0, 0, 0, 0, 0]);
  });
});

/**
 * areaWeightedMeanIsmMapChannel — the log-radial grid's outer rings cover far
 * more physical area than the inner ones, so an area-weighted mean must
 * lean toward whichever ring is bigger, not treat every ring as equal
 * (which is what an accidental fall-back to a plain per-texel mean would
 * do, and would silently under-count exactly the rings that matter for
 * `invMeanNorm`'s flux-normalisation contract).
 */
import { describe, it, expect } from 'vitest';

import type { GalaxyIsmMap } from '../../../src/@types/galaxy/GalaxyIsmMap';
import { areaWeightedMeanIsmMapChannel } from '../../../src/utils/galaxy/areaWeightedMeanIsmMapChannel';

function makeMap(
  rings: number,
  az: number,
  rMin: number,
  rMax: number,
  starsAt: (ring: number) => number,
): GalaxyIsmMap {
  const data = new Float32Array(rings * az * 4);
  for (let ring = 0; ring < rings; ring++) {
    for (let azIdx = 0; azIdx < az; azIdx++) {
      data[(ring * az + azIdx) * 4 + 1] = starsAt(ring);
    }
  }
  return { az, rings, rMin, rMax, data };
}

describe('areaWeightedMeanIsmMapChannel', () => {
  it('weights a wide outer ring more than a narrow inner one of the same texel count', () => {
    // Two rings, log-spaced 1..100: ring 1 (outer) spans far more physical
    // area than ring 0 (inner) despite holding the same texel count — an
    // unweighted mean (0.5) would ignore that entirely.
    const map = makeMap(2, 4, 1, 100, (ring) => (ring === 0 ? 0 : 1));
    const mean = areaWeightedMeanIsmMapChannel(map, (t) => t.stars);
    expect(mean).toBeGreaterThan(0.5);
  });

  it('reduces to the shared value on a uniform map', () => {
    const map = makeMap(4, 6, 1, 50, () => 3);
    expect(areaWeightedMeanIsmMapChannel(map, (t) => t.stars)).toBeCloseTo(3);
  });

  it('returns 0 for an all-zero map', () => {
    const map = makeMap(5, 8, 1, 10, () => 0);
    expect(areaWeightedMeanIsmMapChannel(map, (t) => t.stars)).toBe(0);
  });
});

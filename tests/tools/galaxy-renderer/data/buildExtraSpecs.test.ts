/**
 * buildExtraSpecs — port of the spike's `applyExtras` method
 * (`Galaxy Renderer.dc.html:560-569`): the multi-galaxy perf-test scatter.
 */
import { describe, expect, it } from 'vitest';
import { buildExtraSpecs } from '../../../../tools/galaxy-renderer/src/data/buildExtraSpecs';
import { mulberry32 } from '../../../../src/utils/random/mulberry32';

// The placement formula (html:566) flattens the Y component by 0.6 before
// writing `pos`, so recovering the un-squashed distance means undoing that
// scale on Y before taking the magnitude: x²+z² = dist²·cos(el)², and
// (y/0.6)² = dist²·sin(el)², so the sum is dist² regardless of az/el.
function distanceFromPos(pos: readonly [number, number, number]): number {
  const [x, y, z] = pos;
  return Math.sqrt(x * x + (y / 0.6) * (y / 0.6) + z * z);
}

describe('buildExtraSpecs', () => {
  it('returns `count` specs', () => {
    const specs = buildExtraSpecs(12, mulberry32(1));
    expect(specs).toHaveLength(12);
  });

  it('star counts are in [40000, 200000] and multiples of 1000', () => {
    const specs = buildExtraSpecs(50, mulberry32(2));
    for (const spec of specs) {
      const starCount = spec.params.legacy!.starCount!;
      expect(starCount).toBeGreaterThanOrEqual(40000);
      expect(starCount).toBeLessThanOrEqual(200000);
      expect(starCount % 1000).toBe(0);
    }
  });

  it('distances are in [26, 96]', () => {
    const specs = buildExtraSpecs(50, mulberry32(3));
    for (const spec of specs) {
      const dist = distanceFromPos(spec.pos);
      expect(dist).toBeGreaterThanOrEqual(26);
      expect(dist).toBeLessThanOrEqual(96);
    }
  });

  it('is deterministic under a seeded rng', () => {
    const a = buildExtraSpecs(20, mulberry32(123));
    const b = buildExtraSpecs(20, mulberry32(123));
    expect(a).toEqual(b);
  });
});

/**
 * stretchExtinctionChroma — pins the green-anchored redness stretch:
 * identity at 1, green invariance at any redness, linear spread scaling,
 * and the non-negative clamp at extreme redness.
 */

import { describe, it, expect } from 'vitest';
import { stretchExtinctionChroma } from '../../../src/utils/galaxy/stretchExtinctionChroma';
import type { Vec3 } from '../../../src/@types/math/Vec3';

describe('stretchExtinctionChroma', () => {
  const rgb: Vec3 = [0.88, 1.0, 1.3];

  it('returns the input unchanged at redness 1', () => {
    expect(stretchExtinctionChroma(rgb, 1)).toEqual(rgb);
  });

  it('leaves the green channel invariant at any redness', () => {
    for (const redness of [0, 0.5, 2, 5]) {
      expect(stretchExtinctionChroma(rgb, redness)[1]).toBe(rgb[1]);
    }
  });

  it('scales the red/blue deviation from green linearly with redness', () => {
    const g = rgb[1];
    const doubled = stretchExtinctionChroma(rgb, 2);
    expect(doubled[0] - g).toBeCloseTo(2 * (rgb[0] - g), 10);
    expect(doubled[2] - g).toBeCloseTo(2 * (rgb[2] - g), 10);
  });

  it('clamps a channel at 0 rather than letting extreme redness go negative', () => {
    // rgb[0] < g, so a large redness drives it far negative before clamping.
    const [r] = stretchExtinctionChroma(rgb, 50);
    expect(r).toBe(0);
  });
});

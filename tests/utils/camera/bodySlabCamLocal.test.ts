/**
 * bodySlabCamLocal — per-axis division tests. Reuses `camPosLocal.test.ts`'s
 * oblateness geometry (offset (3, 4, 6.5), radius 2, oblateness 0.35) so the
 * two utils are pinned to agree on the same body — the module header's
 * "unchanged shells" contract, made concrete.
 */

import { describe, expect, it } from 'vitest';

import { bodySlabCamLocal } from '../../../src/utils/camera/bodySlabCamLocal';

describe('bodySlabCamLocal', () => {
  it('puts the camera at unit distance on the surface', () => {
    const radiusM = 6_371_000;
    const local = bodySlabCamLocal([radiusM, 0, 0], radiusM);

    expect(local[0]).toBeCloseTo(1, 12);
    expect(local[1]).toBeCloseTo(0, 12);
    expect(local[2]).toBeCloseTo(0, 12);
  });

  it('applies oblateness per-axis', () => {
    // Spherically (3, 4, 6.5) / 2 = (1.5, 2, 3.25). With oblateness 0.35 the
    // polar divisor becomes 2 · 0.65 = 1.3, so z = 6.5 / 1.3 = 5 — equatorial
    // axes x, y are untouched.
    const local = bodySlabCamLocal([3, 4, 6.5], 2, 0.35);

    expect(local[0]).toBeCloseTo(1.5, 12);
    expect(local[1]).toBeCloseTo(2, 12);
    expect(local[2]).toBeCloseTo(5, 12);
  });
});

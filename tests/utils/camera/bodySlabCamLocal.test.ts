/**
 * bodySlabCamLocal — per-axis division tests.
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

  it('divides every axis by the same metre radius', () => {
    const local = bodySlabCamLocal([3, 4, 6.5], 2);

    expect(local[0]).toBeCloseTo(1.5, 12);
    expect(local[1]).toBeCloseTo(2, 12);
    expect(local[2]).toBeCloseTo(3.25, 12);
  });
});

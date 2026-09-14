/**
 * riddenOrientStepRad — ride + decay (ruling 10). Only the DECAY half is
 * priced in the notch's log-zoom: the ride is the reference's own authored
 * move, which already scales with the notch.
 */

import { describe, it, expect } from 'vitest';

import { riddenOrientStepRad } from '../../../src/utils/camera/riddenOrientStepRad';

describe('riddenOrientStepRad', () => {
  it('a zero-zoom step still rides the authored move but decays nothing', () => {
    expect(riddenOrientStepRad(0.8, 0.2, 0.3, 0)).toBeCloseTo(0.2, 12);
  });

  it('the ride is bounded by rideBound whatever the notch spends', () => {
    // 0.9 of authored move against a 0.3 bound, plus the 0.1 rad the
    // deltaY-100 notch spends of the 3 rad pre-notch deviation.
    expect(riddenOrientStepRad(3, 0.9, 0.3, 0.1)).toBeCloseTo(0.4, 12);
    expect(riddenOrientStepRad(-3, -0.9, 0.3, 0.1)).toBeCloseTo(-0.4, 12);
  });
});

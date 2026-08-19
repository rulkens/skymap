/**
 * zoneOfAvoidanceLayerOpacity — unit tests for the visibility WINDOW (approach
 * band × recede band) × toggle product, mirroring constellationLayerOpacity's
 * shape.
 */

import { describe, it, expect } from 'vitest';

import { zoneOfAvoidanceLayerOpacity } from '../../../../src/services/engine/presentation/zoneOfAvoidanceLayerOpacity';
import { SCALE_FADE_BANDS } from '../../../../src/services/engine/presentation/scaleFadeBands';

describe('zoneOfAvoidanceLayerOpacity', () => {
  it('is 0 at camDist 0', () => {
    // camDist 0 sits at/below goneAt for every plausible band tuning, so the
    // distance band contributes 0 regardless of the toggle opacity.
    expect(zoneOfAvoidanceLayerOpacity(0, 1)).toBe(0);
    expect(zoneOfAvoidanceLayerOpacity(0, 0.5)).toBe(0);
  });

  it('is the product of the distance band and the toggle opacity inside the window', () => {
    // Inside the window (at/above the approach band's fullAt, and at/below
    // the recede band's fullAt) both bands saturate to 1, so the product
    // reduces to the toggle opacity exactly.
    const { fullAt } = SCALE_FADE_BANDS.zoneOfAvoidance;
    const { fullAt: recedeFullAt } = SCALE_FADE_BANDS.zoneOfAvoidanceRecede;
    expect(fullAt).toBeLessThanOrEqual(recedeFullAt);
    expect(zoneOfAvoidanceLayerOpacity(fullAt, 0.7)).toBe(0.7);
    expect(zoneOfAvoidanceLayerOpacity(recedeFullAt, 0.3)).toBe(0.3);
  });

  it('recedes to 0 once the Local Group frames up, past the recede band goneAt', () => {
    const { goneAt } = SCALE_FADE_BANDS.zoneOfAvoidanceRecede;
    expect(zoneOfAvoidanceLayerOpacity(goneAt, 1)).toBe(0);
    expect(zoneOfAvoidanceLayerOpacity(goneAt * 10, 1)).toBe(0);
  });

  it('is strictly between 0 and the inside-window value partway through the recede band', () => {
    const { fullAt: recedeFullAt, goneAt: recedeGoneAt } = SCALE_FADE_BANDS.zoneOfAvoidanceRecede;
    const midway = (recedeFullAt + recedeGoneAt) / 2;
    const opacity = zoneOfAvoidanceLayerOpacity(midway, 1);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
  });
});

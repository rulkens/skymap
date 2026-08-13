/**
 * zoneOfAvoidanceLayerOpacity — unit tests for the band × toggle product,
 * mirroring constellationLayerOpacity's shape.
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

  it('is the product of the distance band and the toggle opacity past fullAt', () => {
    // At/above fullAt the band saturates to 1, so the product reduces to the
    // toggle opacity exactly.
    const { fullAt } = SCALE_FADE_BANDS.zoneOfAvoidance;
    expect(zoneOfAvoidanceLayerOpacity(fullAt, 0.7)).toBe(0.7);
    expect(zoneOfAvoidanceLayerOpacity(fullAt * 10, 0.3)).toBe(0.3);
  });
});

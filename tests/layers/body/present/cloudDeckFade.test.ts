/**
 * cloudDeckFade — the Earth cloud-shell descent fade: full above the band, zero at and below the
 * lower altitude, monotone through it. The endpoints and monotonicity catch a linear-ramp swap or an
 * inverted direction; the zero-radius guard is pinned separately since that divide would silently
 * return NaN into an opacity multiply.
 */

import { describe, it, expect } from 'vitest';

import { cloudDeckFade } from '../../../../src/layers/body/present/cloudDeckFade';
import { CLOUD_SHELL_PARAMS } from '../../../../src/layers/body/present/cloudShellParams';

const BODY_RADIUS_MPC = 1; // an arbitrary unit radius — cloudDeckFade works in radii, not km

/** Distance (Mpc) for a given altitude (body radii) above a unit-radius body. */
function distanceAt(altitudeRadii: number): number {
  return BODY_RADIUS_MPC * (1 + altitudeRadii);
}

describe('cloudDeckFade', () => {
  it('is fully visible well above the fade band', () => {
    expect(
      cloudDeckFade(distanceAt(CLOUD_SHELL_PARAMS.fadeStartAltitudeRadii * 10), BODY_RADIUS_MPC),
    ).toBe(1);
    expect(
      cloudDeckFade(distanceAt(CLOUD_SHELL_PARAMS.fadeStartAltitudeRadii), BODY_RADIUS_MPC),
    ).toBe(1);
  });

  it('is fully gone at and below the lower altitude', () => {
    // AT the edge, allow roundoff from the distance→altitude→fade round trip; fadeBand clamps to an
    // exact 0 once UNAMBIGUOUSLY below it, pinned tolerance-free next.
    expect(
      cloudDeckFade(distanceAt(CLOUD_SHELL_PARAMS.fadeEndAltitudeRadii), BODY_RADIUS_MPC),
    ).toBeCloseTo(0, 9);
    expect(
      cloudDeckFade(distanceAt(CLOUD_SHELL_PARAMS.fadeEndAltitudeRadii / 2), BODY_RADIUS_MPC),
    ).toBe(0);
    expect(cloudDeckFade(distanceAt(0), BODY_RADIUS_MPC)).toBe(0);
  });

  it('decreases monotonically through the band', () => {
    const steps = 9;
    const samples: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const altitudeRadii =
        CLOUD_SHELL_PARAMS.fadeStartAltitudeRadii +
        t * (CLOUD_SHELL_PARAMS.fadeEndAltitudeRadii - CLOUD_SHELL_PARAMS.fadeStartAltitudeRadii);
      samples.push(cloudDeckFade(distanceAt(altitudeRadii), BODY_RADIUS_MPC));
    }
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeLessThanOrEqual(samples[i - 1]!);
    }
    expect(samples[0]).toBeGreaterThan(samples[samples.length - 1]!);
  });

  it('returns 1 (fully visible) for a degenerate non-positive body radius, never NaN', () => {
    expect(cloudDeckFade(5, 0)).toBe(1);
    expect(cloudDeckFade(5, -1)).toBe(1);
    expect(cloudDeckFade(0, 0)).toBe(1);
  });
});

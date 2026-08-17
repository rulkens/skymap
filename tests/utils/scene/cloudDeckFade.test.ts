/**
 * cloudDeckFade — unit tests for the Earth cloud-shell descent fade.
 *
 * The load-bearing properties: full visibility well above the fade band, zero
 * at and below the lower altitude, and a monotone decrease through the band —
 * a future edit that swapped in a linear ramp or inverted the direction would
 * still pass a bare "returns a number in [0,1]" check but fail monotonicity or
 * the endpoints pinned here. The degenerate zero-radius guard is pinned
 * separately since it is a divide that would otherwise silently return NaN
 * into what is ultimately an opacity multiply.
 */

import { describe, it, expect } from 'vitest';

import { cloudDeckFade } from '../../../src/utils/scene/cloudDeckFade';
import { CLOUD_SHELL_PARAMS } from '../../../src/data/bodies/cloudShellParams';

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
    // The band's own upper edge is also full — smoothstep is 1 AT the edge.
    expect(
      cloudDeckFade(distanceAt(CLOUD_SHELL_PARAMS.fadeStartAltitudeRadii), BODY_RADIUS_MPC),
    ).toBe(1);
  });

  it('is fully gone at and below the lower altitude', () => {
    // Exactly AT the edge, allow for the roundoff a distance→altitude→fade
    // round trip introduces (subtracting two near-equal floats); the
    // fadeBand clamp guarantees an exact 0 once the input is UNAMBIGUOUSLY
    // below the edge, which the next two assertions pin without any
    // tolerance.
    expect(
      cloudDeckFade(distanceAt(CLOUD_SHELL_PARAMS.fadeEndAltitudeRadii), BODY_RADIUS_MPC),
    ).toBeCloseTo(0, 9);
    // Clearly below the lower edge, and at the surface (altitude 0): both
    // clamp to exactly 0, not negative or NaN.
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
    // Not a flat line — the band actually does something between its edges.
    expect(samples[0]).toBeGreaterThan(samples[samples.length - 1]!);
  });

  it('returns 1 (fully visible) for a degenerate non-positive body radius, never NaN', () => {
    expect(cloudDeckFade(5, 0)).toBe(1);
    expect(cloudDeckFade(5, -1)).toBe(1);
    expect(cloudDeckFade(0, 0)).toBe(1);
  });
});

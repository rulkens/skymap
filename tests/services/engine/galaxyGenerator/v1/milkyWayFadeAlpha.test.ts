/**
 * milkyWayFadeAlpha — every expectation here is DERIVED from the
 * calibration knobs plus the apparent-size util, never hardcoded distances:
 * the band edges are visual-gate tunables, and a re-tune must not break
 * this suite. The fixtures invert the apparent-size formula to find the
 * camera distance at which the disc spans exactly `fullPx`/`gonePx`.
 */
import { describe, it, expect } from 'vitest';
import { milkyWayFadeAlpha } from '../../../../../src/services/engine/galaxyGenerator/v1/milkyWayFadeAlpha';
import {
  MILKY_WAY_FADE_FULL_PX,
  MILKY_WAY_FADE_GONE_PX,
  MILKY_WAY_RADIUS_MPC,
} from '../../../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';

// Project-default camera: 60° vertical fov into a 720-px-tall viewport.
const FOV_Y_RAD = Math.PI / 3;
const VIEWPORT_H_PX = 720;
const PX_PER_RAD = VIEWPORT_H_PX / (2 * Math.tan(FOV_Y_RAD / 2));

/**
 * Camera distance (Mpc) at which the disc's apparent diameter is `px`.
 * Band-edge fixtures nudge the distance a hair PAST the edge (0.1%) —
 * inverting the formula can land 1 ulp on the wrong side of the exact
 * edge, and smoothstep clamps, so just-past-the-edge is exactly 0 or 1.
 */
function distForApparentPx(px: number): number {
  return (2 * MILKY_WAY_RADIUS_MPC * PX_PER_RAD) / px;
}

describe('milkyWayFadeAlpha', () => {
  it('returns 1.0 at close range (disc larger than the FULL threshold)', () => {
    expect(milkyWayFadeAlpha(0.15, FOV_Y_RAD, VIEWPORT_H_PX)).toBe(1.0);
    expect(
      milkyWayFadeAlpha(
        distForApparentPx(MILKY_WAY_FADE_FULL_PX) * 0.999,
        FOV_Y_RAD,
        VIEWPORT_H_PX,
      ),
    ).toBe(1.0);
  });

  it('returns 0.0 once the disc shrinks to the GONE threshold and beyond', () => {
    const goneDist = distForApparentPx(MILKY_WAY_FADE_GONE_PX) * 1.001;
    expect(milkyWayFadeAlpha(goneDist, FOV_Y_RAD, VIEWPORT_H_PX)).toBe(0.0);
    expect(milkyWayFadeAlpha(goneDist * 10, FOV_Y_RAD, VIEWPORT_H_PX)).toBe(0.0);
  });

  it('returns 0.5 at the band midpoint (smoothstep symmetry)', () => {
    // Smoothstep at t=0.5 evaluates to 0.5 exactly: 3·0.5² − 2·0.5³ = 0.5.
    const midPx = (MILKY_WAY_FADE_GONE_PX + MILKY_WAY_FADE_FULL_PX) / 2;
    expect(milkyWayFadeAlpha(distForApparentPx(midPx), FOV_Y_RAD, VIEWPORT_H_PX)).toBeCloseTo(
      0.5,
      5,
    );
  });

  it('is monotonically non-increasing in camera distance', () => {
    const goneDist = distForApparentPx(MILKY_WAY_FADE_GONE_PX);
    let prev = Infinity;
    for (let d = 0.1; d <= goneDist * 1.5; d += goneDist / 100) {
      const a = milkyWayFadeAlpha(d, FOV_Y_RAD, VIEWPORT_H_PX);
      expect(a).toBeLessThanOrEqual(prev);
      prev = a;
    }
  });

  it('adapts the band to viewport height — the same distance can be visible on a tall screen and gone on a short one', () => {
    // Pick a distance where a 720-px viewport sees just under the GONE
    // threshold: alpha 0 there, but a 4x-taller viewport sees 4x the pixels
    // (well back inside the band), so alpha is positive.
    const d = distForApparentPx(MILKY_WAY_FADE_GONE_PX) * 1.001;
    expect(milkyWayFadeAlpha(d, FOV_Y_RAD, VIEWPORT_H_PX)).toBe(0.0);
    expect(milkyWayFadeAlpha(d, FOV_Y_RAD, VIEWPORT_H_PX * 4)).toBeGreaterThan(0.0);
  });

  it('clamps non-positive distance to full visibility (camera inside the disc, defensive)', () => {
    expect(milkyWayFadeAlpha(0, FOV_Y_RAD, VIEWPORT_H_PX)).toBe(1.0);
    expect(milkyWayFadeAlpha(-5, FOV_Y_RAD, VIEWPORT_H_PX)).toBe(1.0);
  });
});

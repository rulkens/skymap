/**
 * sunVisibleFraction — the analytic umbra/penumbra scalar mesh bodies read
 * instead of a shadow map (spec, "Umbra and Earthshine").
 *
 * All three fixtures share one host/sun angular-radius pair, built from exact
 * 3-4-5 and 1-10 ratios so `asin`/`acos` land on checkable values, and differ
 * only in the angle between the host and Sun directions — the day-side,
 * umbra, and penumbra cases the spec's Testing section names.
 */

import { describe, it, expect } from 'vitest';

import { sunVisibleFraction } from '../../../src/utils/scene/sunVisibleFraction';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const BODY: Vec3 = [0, 0, 0];

// host radius/distance = 6e6 / 1e7 m: sin(hostAngRad) = 0.6, cos(hostAngRad) = 0.8
// (3-4-5 triangle) — hostAngRad = asin(0.6) ≈ 36.87°.
const HOST_RADIUS_M = 6_000_000;
const HOST_DIST_M = 10_000_000;
// sun radius/distance = 7e8 / 7e9 m: sin(sunAngRad) = 0.1 — sunAngRad = asin(0.1) ≈ 5.74°,
// comfortably smaller than hostAngRad so the host is always the larger disc here.
const SUN_RADIUS_M = 700_000_000;
const SUN_DIST_M = 7_000_000_000;

/** `dirM` scaled to `distM` metres from BODY, in Mpc. */
function posAt(dirM: Vec3, distM: number): Vec3 {
  const scale = distM * SCALE_UNITS.M_TO_MPC;
  return [dirM[0] * scale, dirM[1] * scale, dirM[2] * scale];
}

function scenario(hostDir: Vec3): {
  bodyPosMpc: Vec3;
  sunPosMpc: Vec3;
  hostPosMpc: Vec3;
  sunRadiusM: number;
  hostRadiusM: number;
} {
  return {
    bodyPosMpc: BODY,
    sunPosMpc: posAt([1, 0, 0], SUN_DIST_M),
    hostPosMpc: posAt(hostDir, HOST_DIST_M),
    sunRadiusM: SUN_RADIUS_M,
    hostRadiusM: HOST_RADIUS_M,
  };
}

describe('sunVisibleFraction', () => {
  it('is 1 on the day side', () => {
    // Host 90° off the Sun direction. hostAngRad + sunAngRad ≈ 36.87° + 5.74° =
    // 42.6°, well under the 90° separation, so the discs cannot touch.
    const result = sunVisibleFraction(scenario([0, 1, 0]));
    expect(result).toBe(1);
  });

  it('is 0 deep in umbra', () => {
    // Host and Sun in the same direction from the body (separation = 0), under
    // |hostAngRad − sunAngRad| ≈ 31.1° with the host the larger disc.
    const result = sunVisibleFraction(scenario([1, 0, 0]));
    expect(result).toBe(0);
  });

  it('sits strictly inside (0, 1) at a penumbra-edge point', () => {
    // Host direction (0.8, 0.6, 0): dot with the Sun direction (1, 0, 0) is
    // 0.8 = cos(hostAngRad) exactly, so the separation equals hostAngRad. Since
    // sunAngRad > 0, that always lands strictly between the two thresholds:
    //   lowThreshold  = hostAngRad − sunAngRad < hostAngRad
    //   highThreshold = hostAngRad + sunAngRad > hostAngRad
    const result = sunVisibleFraction(scenario([0.8, 0.6, 0]));
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });
});

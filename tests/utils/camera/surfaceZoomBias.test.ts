/**
 * surfaceZoomBias — eye-position delta that converges the orbit eye toward
 * the anchor point sitting under it as altitude shrinks (spec §4.2).
 *
 * The identity-orientation, `radiusMpc = 1` case pins the geometry against a
 * hand-computed expectation: `anchorWorldDir` for a lon/lat-0 anchor under
 * `IDENTITY_MAT3` is world `[1,0,0]` — the same convention `lonLatFocusPose`
 * documents and uses.
 */

import { describe, it, expect } from 'vitest';
import { surfaceZoomBias, FALLOFF_RADII } from '../../../src/utils/camera/surfaceZoomBias';
import { IDENTITY_MAT3 } from '../../../src/utils/math/identityMat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { Mat3 } from '../../../src/@types/math/Mat3';

const ORIGIN: Vec3 = [0, 0, 0];
const ANCHOR_EQUATOR_PRIME = { lonDeg: 0, latDeg: 0 };

describe('surfaceZoomBias', () => {
  it('returns near-zero at large altitude', () => {
    // 100 * radiusMpc * FALLOFF_RADII is many decay constants past the
    // falloff's own scale, so this holds regardless of the implementer's
    // exact FALLOFF_RADII tuning value.
    const radiusMpc = 1;
    const delta = surfaceZoomBias(
      ANCHOR_EQUATOR_PRIME,
      IDENTITY_MAT3 as Mat3,
      ORIGIN,
      radiusMpc,
      100 * radiusMpc * FALLOFF_RADII,
      [0, 0, 5],
    );
    expect(Math.hypot(delta[0], delta[1], delta[2])).toBeLessThan(1e-6);
  });

  it('at altitudeMpc = 0 returns exactly targetEyePos - eyePosMpc', () => {
    // anchorWorldDir = lonLatDegToDirection({0,0}) rotated by IDENTITY_MAT3
    // = [1,0,0]. targetEyePos = bodyCentreMpc + anchorWorldDir * (radius+alt)
    // = [0,0,0] + [1,0,0] * 1 = [1,0,0]. delta = targetEyePos - eyePosMpc
    // = [1,0,0] - [0,0,5] = [1,0,-5].
    const delta = surfaceZoomBias(
      ANCHOR_EQUATOR_PRIME,
      IDENTITY_MAT3 as Mat3,
      ORIGIN,
      1,
      0,
      [0, 0, 5],
    );
    expect(delta[0]).toBeCloseTo(1, 10);
    expect(delta[1]).toBeCloseTo(0, 10);
    expect(delta[2]).toBeCloseTo(-5, 10);
  });

  it('magnitude decreases monotonically as altitude grows', () => {
    // A shape property of the falloff, not a mirror of the formula: whatever
    // exact FALLOFF_RADII the implementation picks, more altitude must never
    // produce a LARGER correction.
    const radiusMpc = 1;
    const eyePosMpc: Vec3 = [0, 0, 5];
    const altitudes = [0, 0.1, 0.5, 1, 2, 5, 10];
    const magnitudes = altitudes.map((altitudeMpc) => {
      const d = surfaceZoomBias(
        ANCHOR_EQUATOR_PRIME,
        IDENTITY_MAT3 as Mat3,
        ORIGIN,
        radiusMpc,
        altitudeMpc,
        eyePosMpc,
      );
      return Math.hypot(d[0], d[1], d[2]);
    });
    for (let i = 1; i < magnitudes.length; i++) {
      expect(magnitudes[i]!).toBeLessThan(magnitudes[i - 1]!);
    }
  });
});

/**
 * orbitTrailFade — two-sided visibility behaviour.
 *
 * The bug these guard against: at close zoom the projected conic degenerates
 * into a screen-filling wedge because the camera sits inside the orbit, and at
 * far zoom sub-pixel orbits never fade. The fade must be 0 at BOTH extremes and
 * non-zero in a healthy middle band — that band is the property the bug broke.
 * These exercise the fade's actual output across those regimes, not its
 * constants.
 */

import { describe, expect, it } from 'vitest';

import { orbitTrailFade } from '../../../src/utils/camera/orbitTrailFade';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const origin: Vec3 = [0, 0, 0];

describe('orbitTrailFade', () => {
  it('returns 0 when the camera is inside the orbit (the wedge-bug guard)', () => {
    // a = 1, camera 0.3·a from the centre → deep inside → degenerate conic.
    const semiMajor: Vec3 = [1, 0, 0];
    const center: Vec3 = [0, 0, 0];
    const cam: Vec3 = [0.3, 0, 0];
    expect(orbitTrailFade(cam, center, semiMajor, origin, 1000)).toBe(0);
  });

  it('returns ≈1 for a healthy outside distance subtending tens of pixels', () => {
    // ratio = 10 (well above INSIDE_HI_RATIO = 4); apparentPx = (1/10)·1000 = 100
    // (well above FAR_HI_PX = 40).
    const semiMajor: Vec3 = [1, 0, 0];
    const center: Vec3 = [0, 0, 0];
    const cam: Vec3 = [10, 0, 0];
    expect(orbitTrailFade(cam, center, semiMajor, origin, 1000)).toBeGreaterThan(0.99);
  });

  it('returns 0 when the orbit is sub-pixel far away', () => {
    // Same a, huge distance → apparentPx = (1/1e6)·1000 = 1e-3 px < FAR_LO_PX.
    const semiMajor: Vec3 = [1, 0, 0];
    const center: Vec3 = [0, 0, 0];
    const cam: Vec3 = [1e6, 0, 0];
    expect(orbitTrailFade(cam, center, semiMajor, origin, 1000)).toBe(0);
  });

  it('has a visible band between the just-inside and far-away extremes', () => {
    // Earth's orbit scale (~4.85e-12 Mpc semi-major) so this also exercises the
    // tiny-number f64 path the real orbits live at.
    const a = 4.85e-12;
    const semiMajor: Vec3 = [a, 0, 0];
    const center: Vec3 = [0, 0, 0];
    const pxPerRad = 800; // ~canvasHeight/(2·tan(fovY/2)) for a typical viewport

    const justInside = orbitTrailFade([0.5 * a, 0, 0], center, semiMajor, origin, pxPerRad);
    // Mid distance: ratio = 6 (outside, full inside-fade) and apparentPx =
    // (1/6)·800 ≈ 133 px (full far-fade) → squarely in the visible band.
    const mid = orbitTrailFade([6 * a, 0, 0], center, semiMajor, origin, pxPerRad);
    const veryFar = orbitTrailFade([1e12 * a, 0, 0], center, semiMajor, origin, pxPerRad);

    expect(justInside).toBe(0);
    expect(veryFar).toBe(0);
    expect(mid).toBeGreaterThan(0);
  });
});

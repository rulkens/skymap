/**
 * makeWarpOffset — the galactic-warp vertical offset, extracted from
 * galaxy-model.js:141-151. Zero inside `warpStart`; beyond it, the disk
 * bends into an integral-sign (S) shape whose line of nodes precesses with
 * radius (the twisted-outer-disk look real Cepheid mapping shows for the
 * Milky Way).
 */
import { describe, expect, it } from 'vitest';
import { makeWarpOffset } from '../../../../tools/galaxy-renderer/src/model/makeWarpOffset';
import type { GalaxyParams } from '../../../../tools/galaxy-renderer/@types/model/GalaxyParams';

const baseParams: GalaxyParams = { type: 'Sc' };

describe('makeWarpOffset', () => {
  it('returns zero everywhere when warpStrength is 0', () => {
    const offset = makeWarpOffset({ ...baseParams, warpStrength: 0, warpStart: 0.3 }, 10);
    expect(offset(8, 0)).toBe(0);
    expect(offset(0, 10)).toBe(0);
    expect(offset(-9, 3)).toBe(0);
  });

  it('returns zero inside the warp start radius', () => {
    const offset = makeWarpOffset({ ...baseParams, warpStrength: 1, warpStart: 0.3 }, 10);
    // start = 10 * 0.3 = 3; probe just inside and exactly at it.
    expect(offset(2.9, 0)).toBe(0);
    expect(offset(0, 2.9)).toBe(0);
    expect(offset(3, 0)).toBe(0);
  });

  it('is antisymmetric across the disk (integral-sign shape) at twist 0', () => {
    const offset = makeWarpOffset(
      { ...baseParams, warpStrength: 1, warpTwist: 0, warpStart: 0.3 },
      10,
    );
    const points: Array<[number, number]> = [
      [4, 0],
      [0, 4],
      [3.5, 2],
      [-6, 5],
    ];
    for (const [x, z] of points) {
      expect(offset(x, z)).toBeCloseTo(-offset(-x, -z), 10);
    }
  });

  it('grows quadratically with radial excess', () => {
    const offset = makeWarpOffset(
      { ...baseParams, warpStrength: 1, warpTwist: 0, warpStart: 0.3 },
      10,
    );
    // Fixed azimuth along +z (theta = pi/2, sin term = 1) so the ratio
    // isolates the rel^2 growth: start=3, rel=0.5 -> r=6.5, rel=1 -> r=10.
    const atHalf = offset(0, 6.5);
    const atFull = offset(0, 10);
    expect(atFull / atHalf).toBeCloseTo(4, 5);
  });

  it('twist precesses the node line', () => {
    // warpStart 0 so rel = rr / outerRadius exactly; twist 3 so the node
    // angle sweeps from 0.6 rad (rel=0.2) to 3 rad (rel=1) — straddling the
    // fixed probe azimuth theta0=1.5 rad, so the sign of the offset flips.
    const offset = makeWarpOffset(
      { ...baseParams, warpStrength: 1, warpTwist: 3, warpStart: 0 },
      10,
    );
    const theta0 = 1.5;
    const near = offset(2 * Math.cos(theta0), 2 * Math.sin(theta0)); // rel = 0.2
    const far = offset(10 * Math.cos(theta0), 10 * Math.sin(theta0)); // rel = 1
    expect(near).toBeGreaterThan(0);
    expect(far).toBeLessThan(0);
  });
});

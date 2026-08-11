/**
 * warpHeight — checks the displacement formula against a hand-evaluated
 * point, the flat-inside-onset boundary, and the identity that makes ring
 * placement correct in the first place: `discWarpShear`'s linear map,
 * evaluated at a blob's own (radius, azimuth), must reproduce this
 * function's value there EXACTLY (it is a linearisation about that point,
 * not a distinct approximation) — treating the derivative as the
 * displacement itself would silently misplace every warped ring.
 */
import { describe, it, expect } from 'vitest';
import { warpHeight } from '../../../src/utils/galaxy/warpHeight';
import { discWarpShear } from '../../../src/utils/galaxy/discWarpShear';
import type { GalaxyDescription } from '../../../src/@types/galaxy/GalaxyDescription';

const GEOMETRY: GalaxyDescription = {
  category: 'spiral',
  light: { disc: 0.7, bulge: 0.2, bar: 0, halo: 0.1 },
  luminosity: 100,
  outerRadius: 10,
  diskScaleLen: 3,
  bulgeRadius: 1,
  diskHeight: 0.5,
  flattening: 0.62,
  asymmetry: 0.5,
  lopsidedAmp: 0,
  lopsidedAngle: 0,
  bulgeAxisZ: 1,
  bulgeTiltRad: 0,
  bulgeConcentration: 0.5,
  barLength: 0,
  warpStrength: 0.15,
  warpTwist: 0.35,
  warpStartRadius: 5,
  barTiltRad: 0,
  numArms: 0,
  armStartRadius: 1,
  armInnerRampW: 1,
  armFullRadius: 5,
  armWidthFactor: 0.1,
  waveAmount: 0,
  clumpAmount: 0,
  youngFraction: 0.5,
  hiiPalette: { core: [1, 0.42, 0.56], halo: [0.71, 0.52, 0.51] },
  arms: [],
  irregularClumpCenters: [],
  lenticularCloudCenters: [],
  seed: 1,
};

describe('warpHeight', () => {
  it('is zero inside warpStartRadius', () => {
    expect(warpHeight(4.9, Math.PI / 3, GEOMETRY)).toBe(0);
  });

  it('is zero everywhere when warpStrength is disabled', () => {
    const flat = { ...GEOMETRY, warpStrength: 0 };
    expect(warpHeight(9, 1, flat)).toBe(0);
  });

  it('matches the hand-evaluated warpOffset formula beyond onset', () => {
    const radius = 8;
    const azimuth = 1.1;
    const rel =
      (radius - GEOMETRY.warpStartRadius) / (GEOMETRY.outerRadius - GEOMETRY.warpStartRadius);
    const node = GEOMETRY.warpTwist * rel;
    const expected =
      GEOMETRY.warpStrength * GEOMETRY.outerRadius * 0.4 * rel * rel * Math.sin(azimuth - node);
    expect(warpHeight(radius, azimuth, GEOMETRY)).toBeCloseTo(expected, 12);
  });

  it("discWarpShear's linear map reproduces warpHeight exactly at the blob's own centre", () => {
    const radius = 7.5;
    const azimuth = 2.0;
    const x = radius * Math.cos(azimuth);
    const z = radius * Math.sin(azimuth);
    const [shearX, shearZ] = discWarpShear(radius, GEOMETRY);
    // The shear inverts the displacement (y' = y + shearX*x + shearZ*z
    // undoes y = yFlat + warpHeight), so the linear form is the NEGATIVE
    // of the true displacement at the point it is linearised about.
    expect(shearX * x + shearZ * z).toBeCloseTo(-warpHeight(radius, azimuth, GEOMETRY), 10);
  });
});

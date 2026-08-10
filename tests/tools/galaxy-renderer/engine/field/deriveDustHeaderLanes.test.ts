/**
 * deriveDustHeaderLanes — hand-computed checks on the branches `drawFrame`
 * actually depends on: reachR's multiplier/floor/warp-cap arithmetic, the
 * `live` gate (geometry null OR dust disabled both collapse to the identity
 * lanes), and the noise contrastExp inversion + its own divide-by-zero floor.
 */
import { describe, expect, it } from 'vitest';
import { deriveDustHeaderLanes } from '../../../../../tools/galaxy-renderer/src/engine/field/deriveDustHeaderLanes';
import type { GalaxyDescription } from '../../../../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyDustParams } from '../../../../../src/@types/galaxy/GalaxyDustParams';

// diskScaleLen 2.7 makes discLightScaleLength (diskScaleLen / (1 + 1/1.7))
// land exactly on 1.7 — 2.7 * (17/27) = 1.7 — so scaleLenRatio: 1 gives a
// clean hDust of 1.7 to hand-multiply against DISC_SIGMA_RATIOS' widest
// ratio (1.9) below.
const GEOMETRY: GalaxyDescription = {
  category: 'spiral',
  light: { disc: 0.7, bulge: 0.2, bar: 0, halo: 0.1 },
  luminosity: 100,
  outerRadius: 10,
  diskScaleLen: 2.7,
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
  warpStrength: 0,
  warpTwist: 0,
  warpStartRadius: 5,
  barTiltRad: 0,
  numArms: 2,
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

const DUST: GalaxyDustParams = {
  enabled: true,
  tau: 0.7,
  scaleLenRatio: 1,
  heightRatio: 0.35,
  rV: 3.1,
  redness: 1,
  cloud: {
    count: 12000,
    clumpiness: 0,
    sizeScale: 1,
    sizeFloorPc: 15,
    elongation: 1,
    heightRatio: 1,
    texture: 0.6,
    textureScale: 1,
    textureContrast: 2,
    mapDetail: 0.7,
    dustPlacementCap: 0,
    carve: 0.4,
    carveSharpness: 0.6,
    carveStretch: 1.2,
  },
};

describe('deriveDustHeaderLanes — reachR', () => {
  it('is 3x the widest disc sigma when the disc is unwarped (uncapped)', () => {
    // hDust = 1 * 1.7 = 1.7; widest ratio 1.9 -> sigmaR = 3.23; reachR = 3*3.23.
    const lanes = deriveDustHeaderLanes(GEOMETRY, DUST, true);
    expect(lanes.reachR).toBeCloseTo(9.69, 10);
  });

  it('is capped by the warp-start-radius validity boundary once the disc warps', () => {
    // sigmaRCap = warpStartRadius * 0.5 = 1.0, which undercuts the uncapped
    // 1.9*hDust=3.23 above, so the capped value (1.0) wins the max() over i.
    const warped = { ...GEOMETRY, warpStrength: 0.1, warpStartRadius: 2 };
    const lanes = deriveDustHeaderLanes(warped, DUST, true);
    expect(lanes.reachR).toBeCloseTo(3.0, 10);
  });

  it('floors at DUST_REACH_FLOOR when the dust scale collapses toward 0', () => {
    // hDust = 1e-6 * 1.7 = 1.7e-6; 3*1.9*hDust ~= 9.69e-6, far under the
    // module's own 1e-3 floor, so the floor -- not the collapsed formula --
    // is what reaches the header (the landmine the source names: a
    // vanishing R would otherwise collapse tNear/tFar to the same value).
    const collapsed: GalaxyDustParams = { ...DUST, scaleLenRatio: 1e-6 };
    const lanes = deriveDustHeaderLanes(GEOMETRY, collapsed, true);
    expect(lanes.reachR).toBe(0.001);
  });

  it('floors at DUST_REACH_FLOOR for the disc-less (geometry === null) category', () => {
    const lanes = deriveDustHeaderLanes(null, DUST, true);
    expect(lanes.reachR).toBe(0.001);
  });
});

describe('deriveDustHeaderLanes — live gate', () => {
  it('wires the live noise/detail/carve lanes straight from dust.cloud when geometry is present and dust is enabled', () => {
    const lanes = deriveDustHeaderLanes(GEOMETRY, DUST, true);
    expect(lanes.noise.amplitude).toBe(0.6);
    expect(lanes.noise.cloudOffset).toBe(0);
    expect(lanes.detail).toBe(0.7);
    expect(lanes.carve).toEqual({ carve: 0.4, sharpness: 0.6, stretch: 1.2 });
  });

  it('collapses noise/detail/carve to the identity when dust is disabled, even with geometry present', () => {
    const lanes = deriveDustHeaderLanes(GEOMETRY, DUST, false);
    expect(lanes.noise).toEqual({ tileUnits: 1, amplitude: 0, cloudOffset: 0, contrastExp: 1 });
    expect(lanes.detail).toBe(0);
    expect(lanes.carve).toEqual({ carve: 0, sharpness: 0.5, stretch: 1 });
    // reachR is sized off geometry regardless of the dust toggle -- the
    // slice edges drawFrame packs would otherwise degenerate while dust is
    // merely switched off, not while there's no galaxy to size it from.
    expect(lanes.reachR).toBeCloseTo(9.69, 10);
  });

  it('collapses noise/detail/carve to the identity when geometry is null, even with dust enabled', () => {
    const lanes = deriveDustHeaderLanes(null, DUST, true);
    expect(lanes.noise).toEqual({ tileUnits: 1, amplitude: 0, cloudOffset: 0, contrastExp: 1 });
    expect(lanes.detail).toBe(0);
    expect(lanes.carve).toEqual({ carve: 0, sharpness: 0.5, stretch: 1 });
  });
});

describe('deriveDustHeaderLanes — noise.contrastExp', () => {
  it('inverts textureContrast: a higher slider value yields a SMALLER exponent', () => {
    const soft = deriveDustHeaderLanes(GEOMETRY, { ...DUST, cloud: { ...DUST.cloud, textureContrast: 2 } }, true);
    const hard = deriveDustHeaderLanes(GEOMETRY, { ...DUST, cloud: { ...DUST.cloud, textureContrast: 4 } }, true);
    expect(soft.noise.contrastExp).toBe(0.5);
    expect(hard.noise.contrastExp).toBe(0.25);
    expect(hard.noise.contrastExp).toBeLessThan(soft.noise.contrastExp);
  });

  it('floors the divisor at 1e-3 so a zero/negative textureContrast cannot reach an infinite exponent', () => {
    const zero = deriveDustHeaderLanes(GEOMETRY, { ...DUST, cloud: { ...DUST.cloud, textureContrast: 0 } }, true);
    const negative = deriveDustHeaderLanes(
      GEOMETRY,
      { ...DUST, cloud: { ...DUST.cloud, textureContrast: -5 } },
      true,
    );
    expect(zero.noise.contrastExp).toBe(1000);
    expect(negative.noise.contrastExp).toBe(1000);
  });
});

/**
 * sampleIsmMapEventPosition's own guard: draws confine to the CDF's texel
 * footprint (`sampleIsmMapDustCdf`'s own tests cover the sampler itself) AND
 * `y` lands on the exact `warpHeight` value at the sampled (radius, angle)
 * — the one thing this function adds — never a flat or gaussian-scattered
 * stand-in (see the module header on why that would be a regression).
 */
import { describe, expect, it } from 'vitest';
import { buildIsmMapDustCdf } from '../../../src/utils/galaxy/buildIsmMapDustCdf';
import { sampleIsmMapEventPosition } from '../../../src/utils/galaxy/sampleIsmMapEventPosition';
import { ismMapDustRingEdges } from '../../../src/utils/galaxy/ismMapDustRingEdges';
import { warpHeight } from '../../../src/utils/galaxy/warpHeight';
import { mulberry32 } from '../../../src/utils/random/mulberry32';
import type { GalaxyDescription } from '../../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyIsmMap } from '../../../src/@types/galaxy/GalaxyIsmMap';

const AZ = 4;
const RINGS = 4;
const R_MIN = 1;
const R_MAX = 8;

// warpStartRadius 5, outerRadius 10 — ring 3 below (rInner ~5.66) sits
// entirely past onset, so the warp lift this test checks is never trivially 0.
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

/** A single hot texel in the `recentSf` (G) channel — the density this sampler weights by. */
function makeSingleHotMap(ring: number, azIdx: number): GalaxyIsmMap {
  const data = new Float32Array(RINGS * AZ * 4);
  data[(ring * AZ + azIdx) * 4 + 1] = 1;
  return { az: AZ, rings: RINGS, rMin: R_MIN, rMax: R_MAX, data };
}

describe('sampleIsmMapEventPosition', () => {
  it('confines every draw to its hot texel and warp-lifts it exactly', () => {
    const ring = 3;
    const azIdx = 1;
    const map = makeSingleHotMap(ring, azIdx);
    const cdf = buildIsmMapDustCdf(map, (texel) => texel.recentSf);
    const rng = mulberry32(7);

    const { rInner, rOuter } = ismMapDustRingEdges(ring, RINGS, R_MIN, R_MAX);
    const dTheta = (2 * Math.PI) / AZ;
    const angleInner = azIdx * dTheta;
    const angleOuter = angleInner + dTheta;

    for (let i = 0; i < 50; i++) {
      const [x, y, z] = sampleIsmMapEventPosition(cdf, GEOMETRY, rng);
      const radius = Math.hypot(x, z);
      const angle = Math.atan2(z, x);
      expect(radius).toBeGreaterThanOrEqual(rInner);
      expect(radius).toBeLessThanOrEqual(rOuter);
      expect(angle).toBeGreaterThanOrEqual(angleInner);
      expect(angle).toBeLessThan(angleOuter);
      const expectedY = warpHeight(radius, angle, GEOMETRY);
      expect(expectedY).not.toBe(0); // sanity: this ring is past warpStartRadius
      expect(y).toBeCloseTo(expectedY, 12);
    }
  });
});

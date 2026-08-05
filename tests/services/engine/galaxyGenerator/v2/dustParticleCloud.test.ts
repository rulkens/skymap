/**
 * The dust cloud's size knob is a SIZE knob. It once also scaled the
 * complex child scatter, which made every particle's centre an exact
 * homothety about its complex's seed point — sprites slid across the disc as
 * the slider moved instead of growing in place. Nothing else sees it: the
 * field is drawn from `center` + inverse covariance, so a moving centre is
 * only visible on screen.
 */
import { describe, expect, it } from 'vitest';
import type { GalaxyFieldComponent } from '../../../../../src/@types/galaxy/GalaxyFieldComponent';
import type { GalaxySfMap } from '../../../../../src/@types/galaxy/GalaxySfMap';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../../src/data/milkyWay/milkyWayGalaxyParams';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { DEFAULT_GALAXY_DUST_PARAMS } from '../../../../../src/services/engine/galaxyGenerator/v2/defaultGalaxyDustParams';
import { buildDustParticleCloud } from '../../../../../src/services/engine/galaxyGenerator/v2/dustParticleCloud';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import { sfMapRingRadius } from '../../../../../src/utils/galaxy/sfMapRingRadius';

const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);
const MAP_AZ = 32;
const MAP_RINGS = 16;
const MAP_R_MIN = 0.5;

/** A busy, non-degenerate legacy density (gas x oldActivity varies per texel) so the CDF is never flat; `dustValue` is constant everywhere. */
function makeMap(dustValue: number): GalaxySfMap {
  const data = new Float32Array(MAP_RINGS * MAP_AZ * 4);
  for (let i = 0; i < data.length; i += 4) {
    const idx = i / 4;
    data[i] = 0.3 + (0.5 * ((idx * 7) % 11)) / 11; // gas
    data[i + 1] = 0.2; // recentSf, unread by sfMapDustDensity
    data[i + 2] = 0.4 + (0.4 * ((idx * 13) % 9)) / 9; // oldActivity
    data[i + 3] = dustValue;
  }
  return { az: MAP_AZ, rings: MAP_RINGS, rMin: MAP_R_MIN, rMax: geometry.outerRadius, data };
}

/** Clumpiness deliberately non-zero: at 0 a lone child has no scatter to be scaled, so the coupling would hide. */
function buildAtSizeScale(sizeScale: number) {
  const dust = {
    ...DEFAULT_GALAXY_DUST_PARAMS,
    cloud: { ...DEFAULT_GALAXY_DUST_PARAMS.cloud, count: 400, clumpiness: 0.5, sizeScale },
  };
  return buildDustParticleCloud(geometry, dust, DEFAULT_GALAXY_FIELD_TUNING, 1, null, null);
}

describe('buildDustParticleCloud', () => {
  it('resizes clouds in place — sizeScale moves no particle centre', () => {
    const base = buildAtSizeScale(1);
    const doubled = buildAtSizeScale(2);
    expect(doubled.length).toBe(base.length);

    for (let i = 0; i < base.length; i++) {
      expect(doubled[i]!.center).toEqual(base[i]!.center);
      expect(doubled[i]!.boundRadius).toBeCloseTo(base[i]!.boundRadius * 2, 10);
    }
  });

  it('sweptMix 0 is byte-identical no matter what the swept dust channel carries', () => {
    const dust = {
      ...DEFAULT_GALAXY_DUST_PARAMS,
      cloud: { ...DEFAULT_GALAXY_DUST_PARAMS.cloud, count: 500, clumpiness: 0.3 },
    };
    const tuning = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      dust: { ...DEFAULT_GALAXY_FIELD_TUNING.dust, sweptMix: 0 },
    };
    const quietSwept = makeMap(0.05);
    const busySwept = makeMap(5000); // would swamp the CDF at any sweptMix > 0
    const withQuiet = buildDustParticleCloud(geometry, dust, tuning, 1, quietSwept, null);
    const withBusy = buildDustParticleCloud(geometry, dust, tuning, 1, busySwept, null);
    expect(withQuiet.length).toBeGreaterThan(0); // sanity: the map-seeded path really ran
    expect(withBusy).toEqual(withQuiet);
  });

  it('sweptMix 1 shifts seeded mass onto the swept channel’s hot texel, off the legacy product’s', () => {
    // Two well-separated texels, one hot per channel, everything else at a
    // shared baseline that clears the S3 survival floor (DUST_SURVIVAL_
    // DENSITY_FLOOR = 0.01) so the filter can't confound the placement test.
    const az = MAP_AZ;
    const rings = MAP_RINGS;
    const data = new Float32Array(rings * az * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0.15; // gas
      data[i + 1] = 0.2; // recentSf
      data[i + 2] = 0.15; // oldActivity -> legacy baseline 0.0225
      data[i + 3] = 0.05; // dust baseline
    }
    const ringA = 4;
    const azA = 4;
    const ringB = 12;
    const azB = 20; // opposite side of the disc from A
    const dTheta = (2 * Math.PI) / az;
    const setTexel = (
      ring: number,
      azIdx: number,
      patch: Partial<Record<'gas' | 'oldActivity' | 'dust', number>>,
    ): void => {
      const base = (ring * az + azIdx) * 4;
      if (patch.gas !== undefined) data[base] = patch.gas;
      if (patch.oldActivity !== undefined) data[base + 2] = patch.oldActivity;
      if (patch.dust !== undefined) data[base + 3] = patch.dust;
    };
    setTexel(ringA, azA, { dust: 50000 }); // hot in the SWEPT channel only
    setTexel(ringB, azB, { gas: 20, oldActivity: 20 }); // hot in the LEGACY product only (400)
    const map: GalaxySfMap = { az, rings, rMin: MAP_R_MIN, rMax: geometry.outerRadius, data };

    const centerOf = (ring: number, azIdx: number): { x: number; z: number } => {
      const r = sfMapRingRadius(ring, rings, MAP_R_MIN, geometry.outerRadius);
      const angle = (azIdx + 0.5) * dTheta;
      return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
    };
    const a = centerOf(ringA, azA);
    const b = centerOf(ringB, azB);
    const meanDistTo = (
      components: readonly Pick<GalaxyFieldComponent, 'center'>[],
      target: { x: number; z: number },
    ): number => {
      let sum = 0;
      for (const c of components) sum += Math.hypot(c.center[0] - target.x, c.center[2] - target.z);
      return sum / components.length;
    };

    const dust = {
      ...DEFAULT_GALAXY_DUST_PARAMS,
      cloud: { ...DEFAULT_GALAXY_DUST_PARAMS.cloud, count: 2000, clumpiness: 0 },
    };
    const tuning = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      dust: { ...DEFAULT_GALAXY_FIELD_TUNING.dust, sweptMix: 1 },
    };
    const swept = buildDustParticleCloud(geometry, dust, tuning, 1, map, null);
    expect(swept.length).toBeGreaterThan(0);

    // Overwhelmingly placed near A (the swept channel's hot texel), not B.
    expect(meanDistTo(swept, a)).toBeLessThan(meanDistTo(swept, b) * 0.1);
  });
});

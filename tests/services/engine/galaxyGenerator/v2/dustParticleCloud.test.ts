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

/** A busy, non-degenerate legacy density (gas x activity varies per texel) so the CDF is never flat; `dustValue` is constant everywhere. */
function makeMap(dustValue: number): GalaxySfMap {
  const data = new Float32Array(MAP_RINGS * MAP_AZ * 4);
  for (let i = 0; i < data.length; i += 4) {
    const idx = i / 4;
    data[i] = 0.3 + (0.5 * ((idx * 7) % 11)) / 11; // gas
    data[i + 1] = 0.2; // recentSf, unread by sfMapDustDensity
    data[i + 2] = 0.4 + (0.4 * ((idx * 13) % 9)) / 9; // activity
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

  it('seeds mass onto the swept channel’s hot texel, off the legacy product’s', () => {
    // Two well-separated texels, one hot per channel, everything else at a
    // shared baseline that clears the S3 survival floor (DUST_SURVIVAL_
    // DENSITY_FLOOR = 0.01) so the filter can't confound the placement test.
    // The dust baseline sits at SF_MAP_AMBIENT_DUST (1.0, zero overshoot)
    // like a quiet automaton grid — the swept channel is keyed off OVERSHOOT
    // above ambient (`sweptDustOvershoot`), not the absolute value.
    const az = MAP_AZ;
    const rings = MAP_RINGS;
    const data = new Float32Array(rings * az * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0.15; // gas
      data[i + 1] = 0.2; // recentSf
      data[i + 2] = 0.15; // activity -> legacy baseline 0.0225
      data[i + 3] = 1.0; // dust baseline: ambient, zero overshoot
    }
    const ringA = 4;
    const azA = 4;
    const ringB = 12;
    const azB = 20; // opposite side of the disc from A
    const dTheta = (2 * Math.PI) / az;
    const setTexel = (
      ring: number,
      azIdx: number,
      patch: Partial<Record<'gas' | 'activity' | 'dust', number>>,
    ): void => {
      const base = (ring * az + azIdx) * 4;
      if (patch.gas !== undefined) data[base] = patch.gas;
      if (patch.activity !== undefined) data[base + 2] = patch.activity;
      if (patch.dust !== undefined) data[base + 3] = patch.dust;
    };
    setTexel(ringA, azA, { dust: 1.5 }); // hot in the SWEPT channel's OVERSHOOT only (0.5 above ambient)
    setTexel(ringB, azB, { gas: 20, activity: 20 }); // hot in the LEGACY product only (400)
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
    const swept = buildDustParticleCloud(geometry, dust, DEFAULT_GALAXY_FIELD_TUNING, 1, map, null);
    expect(swept.length).toBeGreaterThan(0);

    // Overwhelmingly placed near A (the swept channel's hot texel), not B.
    expect(meanDistTo(swept, a)).toBeLessThan(meanDistTo(swept, b) * 0.1);
  });

  it('zero overshoot everywhere degrades to the smoothDisc fallback, not NaN', () => {
    // makeMap's legacy channel (gas x activity) is busy/non-degenerate,
    // but its dust channel is a flat SF_MAP_AMBIENT_DUST (1.0) — no texel
    // has swept past ambient, so meanOvershoot is exactly 0 and density is 0
    // for every texel: `buildSfMapDustCdf`'s total comes out 0, and
    // `buildDustParticleCloud` leaves `placement` at its `smoothDisc`
    // default — the same code path an absent map takes (see the guard's own
    // comment in dustParticleCloud.ts).
    const ambientMap = makeMap(1.0);
    const dust = {
      ...DEFAULT_GALAXY_DUST_PARAMS,
      cloud: { ...DEFAULT_GALAXY_DUST_PARAMS.cloud, count: 400, clumpiness: 0.5 },
    };
    const seeded = buildDustParticleCloud(
      geometry,
      dust,
      DEFAULT_GALAXY_FIELD_TUNING,
      1,
      ambientMap,
      null,
    );
    const unseeded = buildDustParticleCloud(geometry, dust, DEFAULT_GALAXY_FIELD_TUNING, 1, null, null);
    expect(seeded.length).toBeGreaterThan(0);
    for (const p of seeded) {
      expect(Number.isFinite(p.amplitude)).toBe(true);
    }
    // The CDF-total-0 fallback takes literally the same smoothDisc code path
    // as no map at all, off the same rng stream, so the two are byte-identical.
    expect(seeded).toEqual(unseeded);
  });
});

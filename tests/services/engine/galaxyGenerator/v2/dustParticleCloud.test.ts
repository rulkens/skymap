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
    data[i + 1] = 0.2; // recentSf, unread by dust placement or its survival filter
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
    // shared baseline. The dust baseline sits at SF_MAP_AMBIENT_DUST (1.0,
    // zero overshoot) like a quiet automaton grid — both placement AND (S3)
    // survival key off OVERSHOOT above ambient (`sweptDustOvershoot`), not
    // the absolute value, so B's legacy-only heat (gas x activity) buys it
    // neither placement mass nor a pass through the survival filter.
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

  it('keeps particles alive on the dust lane even when activity is zero everywhere', () => {
    // The FLUID generator's `activity` is an EMA of event stamps that decays
    // to ~0 away from a recent ignition — the bug this filter was re-keyed
    // away from: under the old `gas x activity` criterion, activity = 0
    // everywhere dropped every placed particle regardless of where the map's
    // own dust actually was. Overshoot doesn't have that failure mode: the
    // dust channel is conserved/advected, not an EMA, so a texel the
    // automaton swept keeps its overshoot long after the front that made it.
    const az = MAP_AZ;
    const rings = MAP_RINGS;
    const data = new Float32Array(rings * az * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0.5; // gas
      data[i + 1] = 0.2; // recentSf
      data[i + 2] = 0; // activity: zero everywhere
      data[i + 3] = 1.0; // dust baseline: ambient, zero overshoot
    }
    const ring = 8;
    const azIdx = 16;
    const base = (ring * az + azIdx) * 4;
    data[base + 3] = 1.4; // one swept texel: 0.4 overshoot, well clear of the floor

    const map: GalaxySfMap = { az, rings, rMin: MAP_R_MIN, rMax: geometry.outerRadius, data };
    const dust = {
      ...DEFAULT_GALAXY_DUST_PARAMS,
      cloud: { ...DEFAULT_GALAXY_DUST_PARAMS.cloud, count: 500, clumpiness: 0 },
    };
    const swept = buildDustParticleCloud(geometry, dust, DEFAULT_GALAXY_FIELD_TUNING, 1, map, null);

    // Pre-fix this was empty: `gas x activity` is 0 at every texel when
    // activity is 0 everywhere, regardless of where the dust channel's mass is.
    expect(swept.length).toBeGreaterThan(0);
  });

  it('culls a child that straddles from a swept texel into a neighbouring cavity', () => {
    // Placement itself only ever seeds a complex's CENTRE inside a texel
    // with real overshoot (S1's CDF draws proportional to swept mass —
    // sampleSfMapDustCdf.test.ts's "confines every draw to a single hot
    // texel"). The survival filter's job is downstream of that: a complex's
    // CHILDREN scatter COMPLEX_SPREAD_PC around the centre and can land in
    // an adjacent, untouched texel the CDF would never have picked on its
    // own — that's what this filter exists to catch, not placement itself.
    const az = MAP_AZ;
    const rings = MAP_RINGS;
    const data = new Float32Array(rings * az * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0.5; // gas
      data[i + 1] = 0.2; // recentSf
      data[i + 2] = 0.5; // activity
      data[i + 3] = 1.0; // dust baseline: ambient/cavity, zero overshoot
    }
    // Near rMin, a texel's azimuthal width is comparable to
    // COMPLEX_SPREAD_PC (~0.15 world units) — small enough that a
    // meaningful fraction of children scatter clear of it.
    const ring = 1;
    const azIdx = 10;
    const base = (ring * az + azIdx) * 4;
    data[base + 3] = 4.0; // 3.0 overshoot: overwhelmingly the only placement mass on the grid

    const map: GalaxySfMap = { az, rings, rMin: MAP_R_MIN, rMax: geometry.outerRadius, data };
    const dust = {
      ...DEFAULT_GALAXY_DUST_PARAMS,
      cloud: { ...DEFAULT_GALAXY_DUST_PARAMS.cloud, count: 4000, clumpiness: 0.6 },
    };
    const swept = buildDustParticleCloud(geometry, dust, DEFAULT_GALAXY_FIELD_TUNING, 1, map, null);

    expect(swept.length).toBeGreaterThan(0);
    // Some children scattered off the hot texel into the flat cavity/ambient
    // background and were dropped — survivors fall short of the request.
    expect(swept.length).toBeLessThan(dust.cloud.count);
  });

  it('dustPlacementContrast=1 (the default) is exactly the untempered proportional CDF', () => {
    // The gamma===1 branch in dustParticleCloud.ts skips Math.pow entirely and
    // reuses the pre-gamma density expression verbatim, so an explicit gamma
    // of 1 must be byte-identical to leaving it at its default — a wiring
    // regression (e.g. the default drifting off 1) would show up here even
    // though it wouldn't touch the pow branch itself.
    const map = makeMap(1.3);
    const explicitGammaOne = {
      ...DEFAULT_GALAXY_DUST_PARAMS,
      cloud: { ...DEFAULT_GALAXY_DUST_PARAMS.cloud, count: 300, dustPlacementContrast: 1 },
    };
    const defaulted = {
      ...DEFAULT_GALAXY_DUST_PARAMS,
      cloud: { ...DEFAULT_GALAXY_DUST_PARAMS.cloud, count: 300 },
    };
    const a = buildDustParticleCloud(geometry, explicitGammaOne, DEFAULT_GALAXY_FIELD_TUNING, 3, map, null);
    const b = buildDustParticleCloud(geometry, defaulted, DEFAULT_GALAXY_FIELD_TUNING, 3, map, null);
    expect(a).toEqual(b);
  });

  it('a pre-existing preset missing dustPlacementContrast places identically to gamma 1, not NaN', () => {
    // `dust.cloud` rides a preset's raw 'p' wire key with no per-field
    // defaults-merge (unlike `GalaxyFieldTuning`'s `f` key, migrated through
    // migrateGalaxyFieldTuningWire.ts) — a preset saved before this field
    // existed loads `cloud.dustPlacementContrast` as `undefined`. Cast to
    // simulate that shape past the type system's `readonly ...: number`.
    const map = makeMap(1.3);
    const { dustPlacementContrast: _drop, ...cloudWithoutGamma } = DEFAULT_GALAXY_DUST_PARAMS.cloud;
    const staleParams = {
      ...DEFAULT_GALAXY_DUST_PARAMS,
      cloud: { ...cloudWithoutGamma, count: 300 } as typeof DEFAULT_GALAXY_DUST_PARAMS.cloud,
    };
    const gammaOne = {
      ...DEFAULT_GALAXY_DUST_PARAMS,
      cloud: { ...DEFAULT_GALAXY_DUST_PARAMS.cloud, count: 300 },
    };
    const stale = buildDustParticleCloud(geometry, staleParams, DEFAULT_GALAXY_FIELD_TUNING, 3, map, null);
    const seeded = buildDustParticleCloud(geometry, gammaOne, DEFAULT_GALAXY_FIELD_TUNING, 3, map, null);
    expect(stale.length).toBeGreaterThan(0);
    for (const p of stale) expect(Number.isFinite(p.amplitude)).toBe(true);
    expect(stale).toEqual(seeded);
  });

  it('tempers placement contrast — low gamma spreads across texels evenly, high gamma clumps onto the hottest', () => {
    // Two well-separated texels at very different overshoot (0.1 vs 2.0):
    // gamma < 1 compresses that 20:1 mass ratio toward parity, gamma > 1
    // stretches it further apart. With clumpiness 0 every particle lands
    // exactly in one texel's own footprint (the rest of the grid carries
    // zero density regardless of gamma, since 0^gamma is 0), so classifying
    // each particle by whichever of the two centres it's nearer to is exact,
    // not a nearest-neighbour approximation.
    const az = MAP_AZ;
    const rings = MAP_RINGS;
    const data = new Float32Array(rings * az * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0.3; // gas
      data[i + 1] = 0.2; // recentSf
      data[i + 2] = 0.3; // activity
      data[i + 3] = 1.0; // dust baseline: ambient, zero overshoot
    }
    const ringA = 4;
    const azA = 4;
    const ringB = 12;
    const azB = 20; // opposite side of the disc from A
    data[(ringA * az + azA) * 4 + 3] = 1.1; // 0.1 overshoot
    data[(ringB * az + azB) * 4 + 3] = 3.0; // 2.0 overshoot
    const map: GalaxySfMap = { az, rings, rMin: MAP_R_MIN, rMax: geometry.outerRadius, data };

    const dTheta = (2 * Math.PI) / az;
    const centerOf = (ring: number, azIdx: number): { x: number; z: number } => {
      const r = sfMapRingRadius(ring, rings, MAP_R_MIN, geometry.outerRadius);
      const angle = (azIdx + 0.5) * dTheta;
      return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
    };
    const a = centerOf(ringA, azA);
    const b = centerOf(ringB, azB);
    const countNearA = (components: readonly Pick<GalaxyFieldComponent, 'center'>[]): number =>
      components.filter((c) => {
        const distA = Math.hypot(c.center[0] - a.x, c.center[2] - a.z);
        const distB = Math.hypot(c.center[0] - b.x, c.center[2] - b.z);
        return distA < distB;
      }).length;

    const buildAtGamma = (dustPlacementContrast: number) => {
      const dust = {
        ...DEFAULT_GALAXY_DUST_PARAMS,
        cloud: {
          ...DEFAULT_GALAXY_DUST_PARAMS.cloud,
          count: 3000,
          clumpiness: 0,
          dustPlacementContrast,
        },
      };
      return buildDustParticleCloud(geometry, dust, DEFAULT_GALAXY_FIELD_TUNING, 5, map, null);
    };

    const flattened = buildAtGamma(0.25);
    const sharpened = buildAtGamma(2);
    expect(flattened.length).toBeGreaterThan(0);
    expect(sharpened.length).toBeGreaterThan(0);

    // gamma=0.25 compresses the 20:1 overshoot ratio toward parity (~32% to
    // A); gamma=2 stretches it further (~0.25% to A) — an order-of-magnitude
    // gap either way, well clear of sampling noise at count=3000.
    expect(countNearA(flattened)).toBeGreaterThan(countNearA(sharpened) * 5);
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

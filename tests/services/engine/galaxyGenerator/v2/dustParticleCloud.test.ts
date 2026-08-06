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
import type { GalaxySfMap } from '../../../../../src/@types/galaxy/GalaxyIsmMap';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../../src/data/milkyWay/milkyWayGalaxyParams';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { DEFAULT_GALAXY_DUST_PARAMS } from '../../../../../src/services/engine/galaxyGenerator/v2/defaultGalaxyDustParams';
import { buildDustParticleCloud } from '../../../../../src/services/engine/galaxyGenerator/v2/dustParticleCloud';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import { sfMapRingRadius } from '../../../../../src/utils/galaxy/ismMapRingRadius';

const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);
const MAP_AZ = 32;
const MAP_RINGS = 16;
const MAP_R_MIN = 0.5;

/** A busy, non-degenerate legacy density (gas x activity varies per texel) so it's never mistaken for the dust channel; `dustValue` is constant everywhere. */
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

const centerOf = (ring: number, azIdx: number, az = MAP_AZ, rings = MAP_RINGS): { x: number; z: number } => {
  const dTheta = (2 * Math.PI) / az;
  const r = sfMapRingRadius(ring, rings, MAP_R_MIN, geometry.outerRadius);
  const angle = (azIdx + 0.5) * dTheta;
  return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
};

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

  it('seeds mass onto the dust channel’s hot texel, off the legacy product’s', () => {
    // Two well-separated texels, one hot per channel, everything else at a
    // TRULY empty (0) baseline. Placement AND (S3) survival both key off the
    // RAW `dust` channel, not gas x activity, so B's legacy-only heat buys it
    // neither placement mass nor a pass through the survival filter. Baseline
    // 0, not SF_MAP_AMBIENT_DUST's old uniform 1.0 pedestal: that pedestal is
    // no longer subtracted off (it IS structure now — see
    // dustParticleCloud.ts's header), so any nonzero baseline here would
    // itself carry ring-normalised placement mass everywhere it sits — only
    // an exactly-zero baseline (every OTHER ring included) leaves A's ring
    // the sole nonzero one, isolating the hot texel the way this test is
    // named for.
    const az = MAP_AZ;
    const rings = MAP_RINGS;
    const data = new Float32Array(rings * az * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0.15; // gas
      data[i + 1] = 0.2; // recentSf
      data[i + 2] = 0.15; // activity -> legacy baseline 0.0225
      data[i + 3] = 0; // dust baseline: empty
    }
    const ringA = 4;
    const azA = 4;
    const ringB = 12;
    const azB = 20; // opposite side of the disc from A, and a DIFFERENT ring
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
    setTexel(ringA, azA, { dust: 0.5 }); // hot in the RAW dust channel only
    setTexel(ringB, azB, { gas: 20, activity: 20 }); // hot in the LEGACY product only (400), dust stays at baseline
    const map: GalaxySfMap = { az, rings, rMin: MAP_R_MIN, rMax: geometry.outerRadius, data };

    const a = centerOf(ringA, azA, az, rings);
    const b = centerOf(ringB, azB, az, rings);
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

    // Overwhelmingly placed near A (the dust channel's hot texel), not B —
    // B's own ring has zero mean (dust stays 0 there), so it gets exactly
    // zero density regardless of its legacy-channel heat.
    expect(meanDistTo(swept, a)).toBeLessThan(meanDistTo(swept, b) * 0.1);
  });

  it('keeps particles alive on the dust lane even when activity is zero everywhere', () => {
    // The FLUID generator's `activity` is an EMA of event stamps that decays
    // to ~0 away from a recent ignition — the bug this filter was re-keyed
    // away from: under the old `gas x activity` criterion, activity = 0
    // everywhere dropped every placed particle regardless of where the map's
    // own dust actually was. The RAW dust channel doesn't have that failure
    // mode: it's conserved/advected, not an EMA, so a texel the automaton
    // swept keeps its dust long after the front that made it.
    const az = MAP_AZ;
    const rings = MAP_RINGS;
    const data = new Float32Array(rings * az * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0.5; // gas
      data[i + 1] = 0.2; // recentSf
      data[i + 2] = 0; // activity: zero everywhere
      data[i + 3] = 1.0; // dust baseline
    }
    const ring = 8;
    const azIdx = 16;
    const base = (ring * az + azIdx) * 4;
    data[base + 3] = 1.4; // one swept texel, well clear of the survival floor

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
    // with real dust (S1's CDF draws proportional to dust mass —
    // sampleSfMapDustCdf.test.ts's "confines every draw to a single hot
    // texel"). The survival filter's job is downstream of that: a complex's
    // CHILDREN scatter COMPLEX_SPREAD_PC around the centre and can land in
    // an adjacent, untouched texel the CDF would never have picked on its
    // own — that's what this filter exists to catch, not placement itself.
    // Baseline TRULY 0, not SF_MAP_AMBIENT_DUST's old uniform 1.0 pedestal:
    // the pedestal is no longer subtracted off (dustParticleCloud.ts's
    // header), so a nonzero baseline here would sit well above the survival
    // floor (`DUST_SURVIVAL_FLOOR_FRAC * ringMean[ring]`, a fraction of the
    // TEXEL'S OWN RING mean — and the baseline all but IS that ring's mean
    // when it covers virtually the whole ring) and nothing would get culled.
    const az = MAP_AZ;
    const rings = MAP_RINGS;
    const data = new Float32Array(rings * az * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0.5; // gas
      data[i + 1] = 0.2; // recentSf
      data[i + 2] = 0.5; // activity
      data[i + 3] = 0; // dust baseline: true cavity
    }
    // Near rMin, a texel's azimuthal width is comparable to
    // COMPLEX_SPREAD_PC (~0.15 world units) — small enough that a
    // meaningful fraction of children scatter clear of it.
    const ring = 1;
    const azIdx = 10;
    const base = (ring * az + azIdx) * 4;
    data[base + 3] = 4.0; // overwhelmingly the only placement mass on the grid

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

  it('a stray dustPlacementContrast key (deleted field) on a loaded preset does not crash placement', () => {
    // `dust.cloud` rides a preset's raw 'p' wire key with no allowlist or
    // per-field validation (`parseGalaxyPreset.ts` just casts the whole `p`
    // object) — a preset saved back when `dustPlacementContrast` (gamma)
    // still existed loads it as a STRAY extra key nothing in this file reads
    // any more. Cast to simulate that shape past the type system's closed
    // `GalaxyDustCloudParams`.
    const map = makeMap(1.3);
    const staleCloud = {
      ...DEFAULT_GALAXY_DUST_PARAMS.cloud,
      count: 300,
      dustPlacementContrast: 0.5,
    } as typeof DEFAULT_GALAXY_DUST_PARAMS.cloud;
    const staleParams = { ...DEFAULT_GALAXY_DUST_PARAMS, cloud: staleCloud };
    const cleanParams = {
      ...DEFAULT_GALAXY_DUST_PARAMS,
      cloud: { ...DEFAULT_GALAXY_DUST_PARAMS.cloud, count: 300 },
    };
    const stale = buildDustParticleCloud(geometry, staleParams, DEFAULT_GALAXY_FIELD_TUNING, 3, map, null);
    const clean = buildDustParticleCloud(geometry, cleanParams, DEFAULT_GALAXY_FIELD_TUNING, 3, map, null);
    expect(stale.length).toBeGreaterThan(0);
    for (const p of stale) expect(Number.isFinite(p.amplitude)).toBe(true);
    // The stray key is inert, not just non-crashing: placement is
    // byte-identical to a preset that never had the field at all.
    expect(stale).toEqual(clean);
  });

  it('dustPlacementCap=0 (the default) is exactly proportional to the raw dust channel', () => {
    // Identity check: with the radial envelope UN-capped, density reduces to
    // (ringMean/globalMean) * (dust/ringMean) = dust/globalMean — the same
    // answer plain global-mean-proportional sampling would give. A busy,
    // single-ring map (makeMap's dustValue is uniform, so ringMean is the
    // same at every ring here, collapsing the envelope term to 1) isolates
    // the identity from any radial-profile interaction.
    const map = makeMap(1.3);
    const explicitZero = {
      ...DEFAULT_GALAXY_DUST_PARAMS,
      cloud: { ...DEFAULT_GALAXY_DUST_PARAMS.cloud, count: 300, dustPlacementCap: 0 },
    };
    const defaulted = {
      ...DEFAULT_GALAXY_DUST_PARAMS,
      cloud: { ...DEFAULT_GALAXY_DUST_PARAMS.cloud, count: 300 },
    };
    const a = buildDustParticleCloud(geometry, explicitZero, DEFAULT_GALAXY_FIELD_TUNING, 3, map, null);
    const b = buildDustParticleCloud(geometry, defaulted, DEFAULT_GALAXY_FIELD_TUNING, 3, map, null);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it('dustPlacementCap below a hot texel’s within-ring ratio strictly reduces its share', () => {
    // The starvation problem the cap solves (see GalaxyDustCloudParams's own
    // doc): a texel blazing far above its RING's own mean eats a runaway
    // share of that ring's splats. One ring (`ring`) carries 31 baseline
    // texels plus one spike (B); every other ring is empty, so this ring is
    // the map's only placement mass and the cap's effect is isolated to it.
    const az = MAP_AZ;
    const rings = MAP_RINGS;
    const data = new Float32Array(rings * az * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0.3; // gas
      data[i + 1] = 0.2; // recentSf
      data[i + 2] = 0.3; // activity
      data[i + 3] = 0; // dust baseline: empty (every ring but `ring`)
    }
    const ring = 8;
    const azB = 16;
    for (let azIdx = 0; azIdx < az; azIdx++) {
      if (azIdx === azB) continue;
      data[(ring * az + azIdx) * 4 + 3] = 1.0; // this ring's own low baseline
    }
    data[(ring * az + azB) * 4 + 3] = 100.0; // B: far above this ring's own mean
    const map: GalaxySfMap = { az, rings, rMin: MAP_R_MIN, rMax: geometry.outerRadius, data };

    const b = centerOf(ring, azB, az, rings);
    const meanDistTo = (components: readonly Pick<GalaxyFieldComponent, 'center'>[]): number => {
      let sum = 0;
      for (const c of components) sum += Math.hypot(c.center[0] - b.x, c.center[2] - b.z);
      return sum / components.length;
    };

    const buildAtCap = (dustPlacementCap: number) => {
      const dust = {
        ...DEFAULT_GALAXY_DUST_PARAMS,
        cloud: { ...DEFAULT_GALAXY_DUST_PARAMS.cloud, count: 3000, clumpiness: 0, dustPlacementCap },
      };
      return buildDustParticleCloud(geometry, dust, DEFAULT_GALAXY_FIELD_TUNING, 5, map, null);
    };

    const uncapped = buildAtCap(0);
    // Between the baseline's own within-ring ratio (1.0 / ringMean, well
    // under 1) and B's uncapped ratio (100 / ringMean, in the tens) —
    // computed from the map above, not hand-picked, so the cap is provably
    // in range regardless of how `ring`'s mean is defined.
    const ringMean = (1.0 * (az - 1) + 100.0) / az;
    const capped = buildAtCap(50.0 / ringMean);

    expect(uncapped.length).toBeGreaterThan(0);
    expect(capped.length).toBeGreaterThan(0);
    // Capping B pulls mass off it and onto the ring's other (baseline)
    // texels, so the mean distance to B's own centre goes UP.
    expect(meanDistTo(capped)).toBeGreaterThan(meanDistTo(uncapped));
  });

  it('the radial envelope survives a cap that only clips a DIFFERENT ring', () => {
    // Two calm rings (A, B — uniform dust, no spike, so no local ratio ever
    // nears any reasonable cap) at DIFFERENT dust levels, so their envelope
    // term (ringMean/globalMean) differs; a THIRD ring (C) carries a spike
    // the cap is sized to clip. If the envelope is truly structural (never
    // touched by the cap), A's and B's own placement counts — and so their
    // RATIO — should be the same whether or not C gets capped; only C's own
    // total should fall.
    const az = MAP_AZ;
    const rings = MAP_RINGS;
    const ringA = 2;
    const ringB = 8;
    const ringC = 14;
    const data = new Float32Array(rings * az * 4);
    for (let ring = 0; ring < rings; ring++) {
      for (let azIdx = 0; azIdx < az; azIdx++) {
        const base = (ring * az + azIdx) * 4;
        data[base] = 0.3; // gas
        data[base + 1] = 0.2; // recentSf
        data[base + 2] = 0.3; // activity
        if (ring === ringA) data[base + 3] = 2.0;
        else if (ring === ringB) data[base + 3] = 5.0;
        else if (ring === ringC) data[base + 3] = 1.0; // C's own low baseline
        else data[base + 3] = 0; // every other ring: empty
      }
    }
    data[(ringC * az + 16) * 4 + 3] = 100.0; // C's spike — well above its own ring mean
    const map: GalaxySfMap = { az, rings, rMin: MAP_R_MIN, rMax: geometry.outerRadius, data };

    const rA = sfMapRingRadius(ringA, rings, MAP_R_MIN, geometry.outerRadius);
    const rB = sfMapRingRadius(ringB, rings, MAP_R_MIN, geometry.outerRadius);
    const rC = sfMapRingRadius(ringC, rings, MAP_R_MIN, geometry.outerRadius);
    const radiusOf = (c: Pick<GalaxyFieldComponent, 'center'>): number =>
      Math.hypot(c.center[0], c.center[2]);
    // Nearest-of-three by RADIUS alone: a ring's own structure spans every
    // azimuth, so (unlike the two-point tests above) a single named centre
    // can't stand in for "this ring" — only the radius band can.
    const nearestRingRadius = (r: number): number => {
      const candidates = [rA, rB, rC];
      let best = candidates[0]!;
      let bestDist = Math.abs(r - best);
      for (const candidate of candidates) {
        const d = Math.abs(r - candidate);
        if (d < bestDist) {
          best = candidate;
          bestDist = d;
        }
      }
      return best;
    };
    const countNearRing = (
      components: readonly Pick<GalaxyFieldComponent, 'center'>[],
      target: number,
    ): number => components.filter((c) => nearestRingRadius(radiusOf(c)) === target).length;

    const ringMeanC = (1.0 * (az - 1) + 100.0) / az;

    const buildAtCap = (dustPlacementCap: number) => {
      const dust = {
        ...DEFAULT_GALAXY_DUST_PARAMS,
        cloud: { ...DEFAULT_GALAXY_DUST_PARAMS.cloud, count: 20000, clumpiness: 0, dustPlacementCap },
      };
      return buildDustParticleCloud(geometry, dust, DEFAULT_GALAXY_FIELD_TUNING, 11, map, null);
    };

    const uncapped = buildAtCap(0);
    const capped = buildAtCap(10.0 / ringMeanC); // well below C's spike ratio, well above A/B's uniform ratio (1.0)

    const uncappedC = countNearRing(uncapped, rC);
    const cappedC = countNearRing(capped, rC);
    expect(cappedC).toBeLessThan(uncappedC); // the cap did something to C
    expect(uncappedC).toBeGreaterThan(0);
    expect(cappedC).toBeGreaterThan(0);

    const uncappedRatio = countNearRing(uncapped, rA) / countNearRing(uncapped, rB);
    const cappedRatio = countNearRing(capped, rA) / countNearRing(capped, rB);
    // A/B's own ratio is untouched by capping a DIFFERENT ring — generous
    // tolerance for sampling noise at a finite particle count.
    expect(cappedRatio).toBeGreaterThan(uncappedRatio * 0.75);
    expect(cappedRatio).toBeLessThan(uncappedRatio * 1.25);
  });

  it('zero dust everywhere degrades to the smoothDisc fallback, not NaN', () => {
    // makeMap's legacy channel (gas x activity) is busy/non-degenerate, but
    // its dust channel is flat 0 — no dust anywhere on the map, so the
    // global mean is exactly 0 and density is 0 for every texel:
    // `buildSfMapDustCdf`'s total comes out 0, and `buildDustParticleCloud`
    // leaves `placement` at its `smoothDisc` default — the same code path an
    // absent map takes (see the guard's own comment in
    // dustParticleCloud.ts). A flat SF_MAP_AMBIENT_DUST (1.0) map, the OLD
    // trigger for this fallback, no longer qualifies: 1.0 is now real
    // (nonzero) placement mass, not an ambient pedestal subtracted down to
    // zero.
    const emptyMap = makeMap(0);
    const dust = {
      ...DEFAULT_GALAXY_DUST_PARAMS,
      cloud: { ...DEFAULT_GALAXY_DUST_PARAMS.cloud, count: 400, clumpiness: 0.5 },
    };
    const seeded = buildDustParticleCloud(
      geometry,
      dust,
      DEFAULT_GALAXY_FIELD_TUNING,
      1,
      emptyMap,
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

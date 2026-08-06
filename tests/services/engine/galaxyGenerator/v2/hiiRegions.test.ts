/**
 * `sfMapSeeding: 0` must reproduce the pre-feature arm-ridge catalog
 * exactly, whether or not a caller happens to hand in an SF map — the real
 * bug this pins is a gate that overwrites a region's centre once a map
 * exists without also checking the blend weight.
 */
import { describe, expect, it } from 'vitest';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../../src/data/milkyWay/milkyWayGalaxyParams';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { armRidgeAngle } from '../../../../../src/services/engine/galaxyGenerator/v2/armRidgeGeometry';
import { DEFAULT_GALAXY_STAR_FORMATION_PARAMS } from '../../../../../src/services/engine/galaxyGenerator/v2/defaultGalaxyStarFormationParams';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import { buildHiiRegions } from '../../../../../src/services/engine/galaxyGenerator/v2/hiiRegions';
import type { GalaxySfMap } from '../../../../../src/@types/galaxy/GalaxyIsmMap';

const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);

/** Busy on every channel — if `sfMapSeeding: 0` ever consulted this, output would move. */
function makeBusyMap(): GalaxySfMap {
  const az = 32;
  const rings = 16;
  const data = new Float32Array(rings * az * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0.78;
    data[i + 1] = 0.7;
    data[i + 2] = 0.6;
  }
  return { az, rings, rMin: 0.5, rMax: geometry.outerRadius, data };
}

describe('buildHiiRegions', () => {
  it('sfMapSeeding 0 is byte-identical whether or not a map is handed in', () => {
    const tuningOff = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      // dig.fraction pinned to 0 too — it is the DIG veil's own knob,
      // orthogonal to sfMapSeeding, and (unlike region placement) it reads
      // the map's mere PRESENCE rather than a blend weight, so leaving it at
      // its nonzero default would break this test's own premise.
      hii: {
        ...DEFAULT_GALAXY_FIELD_TUNING.hii,
        sfMapSeeding: 0,
        dig: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.dig, fraction: 0 },
      },
    };
    const withoutMap = buildHiiRegions(
      geometry,
      tuningOff,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      null,
    );
    const withMap = buildHiiRegions(
      geometry,
      tuningOff,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      makeBusyMap(),
    );
    expect(withMap.length).toBeGreaterThan(0); // sanity: the tier really runs on the MW preset
    expect(withMap).toEqual(withoutMap);
  });

  it('dig.fraction 0 is byte-identical whether or not a map is handed in', () => {
    const tuningOff = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      // sfMapSeeding pinned to 0 too — its own default (1) would already
      // make region CENTRES differ between the map/no-map cases, which
      // would fail this test for a reason that has nothing to do with
      // `dig.fraction`.
      hii: {
        ...DEFAULT_GALAXY_FIELD_TUNING.hii,
        sfMapSeeding: 0,
        dig: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.dig, fraction: 0 },
      },
    };
    const withoutMap = buildHiiRegions(
      geometry,
      tuningOff,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      null,
    );
    const withMap = buildHiiRegions(
      geometry,
      tuningOff,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      makeBusyMap(),
    );
    expect(withMap.length).toBeGreaterThan(0);
    expect(withMap).toEqual(withoutMap);
  });

  it("dig.fraction > 0 with a map adds DIG components clustered near the map's occupied radius", () => {
    const tuningOn = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      hii: {
        ...DEFAULT_GALAXY_FIELD_TUNING.hii,
        dig: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.dig, fraction: 0.35 },
      },
    };
    const map = makeBusyMap();
    const withoutDig = buildHiiRegions(
      geometry,
      { ...tuningOn, hii: { ...tuningOn.hii, dig: { ...tuningOn.hii.dig, fraction: 0 } } },
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      map,
    );
    const withDig = buildHiiRegions(
      geometry,
      tuningOn,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      map,
    );
    const expectedDigCount = tuningOn.hii.dig.complexes * tuningOn.hii.dig.childrenPerComplex;
    expect(withDig.length).toBe(withoutDig.length + expectedDigCount);
    const dig = withDig.slice(withoutDig.length);
    // Individual children can drift past `rMax` (the clustering offset from
    // a complex's seed, same as `armParticleCloud.ts`/`dustParticleCloud.ts`
    // children can land outside their complex's own footprint) — the MEAN
    // radius is the robust invariant that the veil follows the map rather
    // than, say, ignoring it and filling the whole disc.
    const meanRadius =
      dig.reduce((sum, c) => sum + Math.hypot(c.center[0], c.center[2]), 0) / dig.length;
    expect(meanRadius).toBeLessThanOrEqual(map.rMax);
  });

  it('armBias 1 pulls DIG complexes onto the arm envelope, closer than armBias 0 on the identical map', () => {
    // armBias no longer forks a second, analytic arm-lane placement — it
    // reweights the SAME `activity` CDF every complex draws from toward
    // `buildArmProximityEnvelope`'s arm-proximity kernel (`hiiRegions.ts`'s
    // `armBiasedDensity`). `makeBusyMap` is uniform, so any difference in
    // cross-arm distance between armBias 0/1 comes from that reweighting
    // alone, not from the map's own (flat, here) shape.
    const map = makeBusyMap();
    const baseDig = {
      ...DEFAULT_GALAXY_FIELD_TUNING.hii.dig,
      fraction: 0.35,
      coherence: 1,
      childrenPerComplex: 1,
      complexes: 60, // enough draws for the mean below to be a stable signal
    };

    function digComponentsFor(armBias: number) {
      const tuning = {
        ...DEFAULT_GALAXY_FIELD_TUNING,
        hii: { ...DEFAULT_GALAXY_FIELD_TUNING.hii, dig: { ...baseDig, armBias } },
      };
      const withoutDig = buildHiiRegions(
        geometry,
        { ...tuning, hii: { ...tuning.hii, dig: { ...tuning.hii.dig, fraction: 0 } } },
        DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
        geometry.seed,
        map,
      );
      const withDig = buildHiiRegions(
        geometry,
        tuning,
        DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
        geometry.seed,
        map,
      );
      return withDig.slice(withoutDig.length);
    }

    // Mean distance (world units) from each component to the NEAREST arm's
    // ridge at its own radius — the same ridge angle `buildArmProximityEnvelope`
    // itself reweights against (`armRidgeAngle`, meander/wave terms included),
    // not the simplified `phase + pitch*logR` a validation-only formula would
    // silently drift from.
    function meanCrossArmDistance(components: ReturnType<typeof digComponentsFor>): number {
      let sum = 0;
      for (const component of components) {
        const [x, , z] = component.center;
        const radius = Math.hypot(x, z);
        const angle = Math.atan2(z, x);
        const logR = Math.log(radius / geometry.armStartRadius);
        let minDist = Infinity;
        for (const arm of geometry.arms) {
          const ridgeAngle = armRidgeAngle(logR, geometry, arm);
          const raw = angle - ridgeAngle;
          const wrapped = raw - 2 * Math.PI * Math.round(raw / (2 * Math.PI));
          minDist = Math.min(minDist, Math.abs(radius * wrapped));
        }
        sum += minDist;
      }
      return sum / components.length;
    }

    const biased = digComponentsFor(1);
    const unbiased = digComponentsFor(0);
    expect(biased.length).toBeGreaterThan(0);
    expect(unbiased.length).toBeGreaterThan(0);

    const meanBiased = meanCrossArmDistance(biased);
    const meanUnbiased = meanCrossArmDistance(unbiased);
    expect(meanBiased).toBeLessThan(meanUnbiased * 0.5);
  });

  it('associations.brightness 0 is byte-identical whether or not a map is handed in', () => {
    const tuningOff = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      hii: {
        ...DEFAULT_GALAXY_FIELD_TUNING.hii,
        sfMapSeeding: 0,
        dig: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.dig, fraction: 0 },
        associations: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.associations, brightness: 0 },
      },
    };
    const withoutMap = buildHiiRegions(
      geometry,
      tuningOff,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      null,
    );
    const withMap = buildHiiRegions(
      geometry,
      tuningOff,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      makeBusyMap(),
    );
    expect(withMap.length).toBeGreaterThan(0);
    expect(withMap).toEqual(withoutMap);
  });

  it('associations concentrate on a swept old-activity texel and skip a fresh-ignition one', () => {
    // Both texels carry equal activity; only the hot one's recentSf
    // differs — isolates the suppression term from a bare "follows
    // activity" placement.
    const az = 32;
    const rings = 16;
    const hotRing = 2;
    const hotAz = 4;
    const oldRing = 12;
    const oldAz = 20;
    const data = new Float32Array(rings * az * 4);
    const hotI = (hotRing * az + hotAz) * 4;
    data[hotI + 1] = 1; // recentSf: fresh ignition
    data[hotI + 2] = 1; // activity: same magnitude as the swept texel
    const oldI = (oldRing * az + oldAz) * 4;
    data[oldI + 2] = 1; // activity only: swept clear, not currently igniting
    const map: GalaxySfMap = { az, rings, rMin: 0.5, rMax: geometry.outerRadius, data };

    const tuningOn = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      hii: {
        ...DEFAULT_GALAXY_FIELD_TUNING.hii,
        sfMapSeeding: 0,
        dig: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.dig, fraction: 0 },
        associations: {
          ...DEFAULT_GALAXY_FIELD_TUNING.hii.associations,
          brightness: 1,
          armBias: 0, // every complex takes the map-CDF path, deterministically
          complexes: 20,
          childrenPerComplex: 6,
        },
      },
    };
    const tuningOff = {
      ...tuningOn,
      hii: { ...tuningOn.hii, associations: { ...tuningOn.hii.associations, brightness: 0 } },
    };
    const withoutAssn = buildHiiRegions(
      geometry,
      tuningOff,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      map,
    );
    const withAssn = buildHiiRegions(
      geometry,
      tuningOn,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      map,
    );
    const expectedCount =
      tuningOn.hii.associations.complexes * tuningOn.hii.associations.childrenPerComplex;
    expect(withAssn.length).toBe(withoutAssn.length + expectedCount);

    const assn = withAssn.slice(withoutAssn.length);
    const dTheta = (2 * Math.PI) / az;
    const oldAngleCenter = (oldAz + 0.5) * dTheta;
    const hotAngleCenter = (hotAz + 0.5) * dTheta;
    const wrap = (a: number) => Math.abs(a - 2 * Math.PI * Math.round(a / (2 * Math.PI)));
    for (const component of assn) {
      const [x, , z] = component.center;
      const angle = Math.atan2(z, x);
      const deltaOld = wrap(angle - oldAngleCenter);
      const deltaHot = wrap(angle - hotAngleCenter);
      // Generous band, same idea as the arm-bias test above — pins "landed
      // near the swept texel", not an exact bin match once child scatter and
      // radial jitter are folded in.
      expect(deltaOld).toBeLessThan(0.5);
      expect(deltaOld).toBeLessThan(deltaHot);
    }
  });
});

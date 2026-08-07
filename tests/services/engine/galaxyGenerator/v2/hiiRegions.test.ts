/**
 * `ismMapSeeding: 0` must reproduce the pre-feature arm-ridge catalog
 * exactly, whether or not a caller happens to hand in an ISM map — the real
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
import type { GalaxyIsmMap } from '../../../../../src/@types/galaxy/GalaxyIsmMap';

const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);

/** Busy on every channel — if `ismMapSeeding: 0` ever consulted this, output would move. */
function makeBusyMap(): GalaxyIsmMap {
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
  it('ismMapSeeding 0 is byte-identical whether or not a map is handed in', () => {
    const tuningOff = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      // dig.fraction pinned to 0 too — it is the DIG veil's own knob,
      // orthogonal to ismMapSeeding, and (unlike region placement) it reads
      // the map's mere PRESENCE rather than a blend weight, so leaving it at
      // its nonzero default would break this test's own premise.
      hii: {
        ...DEFAULT_GALAXY_FIELD_TUNING.hii,
        ismMapSeeding: 0,
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
      // ismMapSeeding pinned to 0 too — its own default (1) would already
      // make region CENTRES differ between the map/no-map cases, which
      // would fail this test for a reason that has nothing to do with
      // `dig.fraction`.
      hii: {
        ...DEFAULT_GALAXY_FIELD_TUNING.hii,
        ismMapSeeding: 0,
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
    // `dig.complexes` is now a SCALER on the run's own recent-event
    // population (task #10), not a literal count — the count this produces
    // depends on the SF-event catalog, so this pins "some whole number of
    // complexes' worth of children got added" rather than an exact formula.
    expect(withDig.length).toBeGreaterThan(withoutDig.length);
    const dig = withDig.slice(withoutDig.length);
    expect(dig.length % tuningOn.hii.dig.childrenPerComplex).toBe(0);
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
        ismMapSeeding: 0,
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

  it('associations render with a null ISM map — placement is event-derived, not CDF-sampled (task #10)', () => {
    // Associations used to CDF-sample from the map's activity/recentSf
    // channels the way DIG still does; they now seed off the SF-event
    // catalog's own mid-age band instead (`resolveEventLifecyclePopulation`),
    // so a map is no longer a precondition — see `buildBlueAssociations`'s
    // own header for why it dropped the `ismMap` parameter entirely.
    const tuningOn = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      hii: {
        ...DEFAULT_GALAXY_FIELD_TUNING.hii,
        dig: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.dig, fraction: 0 },
        associations: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.associations, brightness: 1 },
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
      null,
    );
    const withAssn = buildHiiRegions(
      geometry,
      tuningOn,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      null,
    );
    expect(withAssn.length).toBeGreaterThan(withoutAssn.length);
    const assn = withAssn.slice(withoutAssn.length);
    expect(assn.length % tuningOn.hii.associations.childrenPerComplex).toBe(0);
  });
});

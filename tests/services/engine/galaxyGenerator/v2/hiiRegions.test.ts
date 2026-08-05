/**
 * `sfMapSeeding: 0` must reproduce the pre-feature arm-ridge catalog
 * exactly, whether or not a caller happens to hand in an SF map — the real
 * bug this pins is a gate that overwrites a region's centre once a map
 * exists without also checking the blend weight.
 */
import { describe, expect, it } from 'vitest';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../../src/data/milkyWay/milkyWayGalaxyParams';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { DEFAULT_GALAXY_STAR_FORMATION_PARAMS } from '../../../../../src/services/engine/galaxyGenerator/v2/defaultGalaxyStarFormationParams';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import { buildHiiRegions } from '../../../../../src/services/engine/galaxyGenerator/v2/hiiRegions';
import type { GalaxySfMap } from '../../../../../src/@types/galaxy/GalaxySfMap';

const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);

/** Busy on every channel — if `sfMapSeeding: 0` ever consulted this, output would move. */
function makeBusyMap(): GalaxySfMap {
  const az = 32;
  const rings = 16;
  const data = new Uint8Array(rings * az * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 200;
    data[i + 1] = 180;
    data[i + 2] = 150;
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

  it('armBias 1 seeds every DIG complex on an arm lane, pulling components toward the arm angles', () => {
    // At armBias 1 every complex takes the arm-lane path (`canUseArms` is
    // true on the MW preset), so each blob's azimuth should sit near SOME
    // arm's ridge angle at that radius rather than uniformly around the
    // ring the way a pure map-CDF placement would scatter it.
    const tuningArmBiased = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      hii: {
        ...DEFAULT_GALAXY_FIELD_TUNING.hii,
        dig: {
          ...DEFAULT_GALAXY_FIELD_TUNING.hii.dig,
          fraction: 0.35,
          armBias: 1,
          coherence: 1,
          childrenPerComplex: 1,
        },
      },
    };
    const map = makeBusyMap();
    const withoutDig = buildHiiRegions(
      geometry,
      {
        ...tuningArmBiased,
        hii: { ...tuningArmBiased.hii, dig: { ...tuningArmBiased.hii.dig, fraction: 0 } },
      },
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      map,
    );
    const withDig = buildHiiRegions(
      geometry,
      tuningArmBiased,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      map,
    );
    const dig = withDig.slice(withoutDig.length);
    expect(dig.length).toBeGreaterThan(0);

    for (const component of dig) {
      const [x, , z] = component.center;
      const radius = Math.hypot(x, z);
      const angle = Math.atan2(z, x);
      // Nearest arm's ridge angle at this radius, wrapped to [-PI, PI].
      let minDelta = Infinity;
      for (const arm of geometry.arms) {
        const logR = Math.log(radius / geometry.armStartRadius);
        const ridgeAngle = arm.phase + arm.pitch * logR;
        const raw = angle - ridgeAngle;
        const wrapped = Math.abs(raw - 2 * Math.PI * Math.round(raw / (2 * Math.PI)));
        minDelta = Math.min(minDelta, wrapped);
      }
      // A generous band — the ridge angle here ignores meander/wave terms
      // and the complex's own cross-lane offset, so this only pins "landed
      // near an arm", not an exact match.
      expect(minDelta).toBeLessThan(0.6);
    }
  });
});

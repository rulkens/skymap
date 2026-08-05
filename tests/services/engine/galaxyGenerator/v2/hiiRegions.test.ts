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
import {
  buildHiiRegions,
  DIG_SPRITE_COUNT,
} from '../../../../../src/services/engine/galaxyGenerator/v2/hiiRegions';
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
      // diffuse pinned to 0 too — it is the DIG veil's own knob, orthogonal
      // to sfMapSeeding, and (unlike region placement) it reads the map's
      // mere PRESENCE rather than a blend weight, so leaving it at its
      // nonzero default would break this test's own premise.
      hii: { ...DEFAULT_GALAXY_FIELD_TUNING.hii, sfMapSeeding: 0, diffuse: 0 },
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

  it('diffuse 0 is byte-identical whether or not a map is handed in', () => {
    const tuningOff = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      // sfMapSeeding pinned to 0 too — its own default (1) would already
      // make region CENTRES differ between the map/no-map cases, which
      // would fail this test for a reason that has nothing to do with
      // `diffuse`.
      hii: { ...DEFAULT_GALAXY_FIELD_TUNING.hii, sfMapSeeding: 0, diffuse: 0 },
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

  it("diffuse > 0 with a map adds DIG components landing inside the map's occupied radius", () => {
    const tuningOn = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      hii: { ...DEFAULT_GALAXY_FIELD_TUNING.hii, diffuse: 0.35 },
    };
    const map = makeBusyMap();
    const withoutDiffuse = buildHiiRegions(
      geometry,
      { ...tuningOn, hii: { ...tuningOn.hii, diffuse: 0 } },
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      map,
    );
    const withDiffuse = buildHiiRegions(
      geometry,
      tuningOn,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      map,
    );
    expect(withDiffuse.length).toBe(withoutDiffuse.length + DIG_SPRITE_COUNT);
    const dig = withDiffuse.slice(withoutDiffuse.length);
    for (const component of dig) {
      const [x, , z] = component.center;
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(map.rMax);
    }
  });
});

/**
 * `tuning.ismMap.generator === 'fluid'` — HII regions seed directly from the
 * fluid sim's own young-event window instead of the parallel arm-ridge
 * catalog, so the tier's output tracks `eventRate`/`impulseDuration`/`steps`
 * rather than `starFormation.sfActivity`. `'automaton'`/`'none'` keep the
 * pre-existing catalog behaviour untouched — see `hiiRegions.test.ts` for
 * the map-seeding/DIG/associations coverage, orthogonal to this file.
 */
import { describe, expect, it } from 'vitest';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../../src/data/milkyWay/milkyWayGalaxyParams';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { DEFAULT_GALAXY_STAR_FORMATION_PARAMS } from '../../../../../src/services/engine/galaxyGenerator/v2/defaultGalaxyStarFormationParams';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import {
  buildGalaxyIsmMapFluidEvents,
  ismMapFluidEventWindow,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapFluidEvents';
import {
  ismMapGridRadius,
  ISM_MAP_AZ,
  ISM_MAP_RINGS,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import { buildHiiRegions } from '../../../../../src/services/engine/galaxyGenerator/v2/hiiRegions';
import { ismMapRingRadius } from '../../../../../src/utils/galaxy/ismMapRingRadius';
import { warpHeight } from '../../../../../src/utils/galaxy/warpHeight';
import type { GalaxyFieldTuning } from '../../../../../src/@types/galaxy/GalaxyFieldTuning';

const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);

/** Isolates the shell/cluster region tier from DIG/associations/map-seeding so a count only moves for the reason each test is pinning. */
function fluidTuning(overrides: {
  readonly eventRate: number;
  readonly steps: number;
  readonly impulseDuration: number;
  readonly clusterStrength?: number;
}): GalaxyFieldTuning {
  return {
    ...DEFAULT_GALAXY_FIELD_TUNING,
    ismMap: { generator: 'fluid' },
    ismMapFluid: {
      ...DEFAULT_GALAXY_FIELD_TUNING.ismMapFluid,
      eventRate: overrides.eventRate,
      steps: overrides.steps,
      impulseDuration: overrides.impulseDuration,
    },
    hii: {
      ...DEFAULT_GALAXY_FIELD_TUNING.hii,
      clusterStrength: overrides.clusterStrength ?? 0,
      dig: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.dig, fraction: 0 },
      associations: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.associations, brightness: 0 },
    },
  };
}

describe('buildHiiRegions — fluid generator seeding', () => {
  it('tracks the fluid event window: doubling eventRate roughly doubles the tier output, and an empty window yields none', () => {
    // impulseDuration > steps captures every event the run ever spawns, so
    // `count = round(eventRate * steps)` IS the window size — isolates this
    // test from `ismMapFluidEventWindow`'s own age-boundary behaviour (that
    // lives in galaxyIsmMapFluidEvents.test.ts).
    const base = fluidTuning({ eventRate: 0.1, steps: 80, impulseDuration: 1000 });
    const doubled = fluidTuning({ eventRate: 0.2, steps: 80, impulseDuration: 1000 });
    const empty = fluidTuning({ eventRate: 0, steps: 80, impulseDuration: 1000 });

    const baseCount = buildHiiRegions(
      geometry,
      base,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      null,
    ).length;
    const doubledCount = buildHiiRegions(
      geometry,
      doubled,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      null,
    ).length;
    const emptyCount = buildHiiRegions(
      geometry,
      empty,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      null,
    ).length;

    expect(baseCount).toBeGreaterThan(0); // sanity: the scenario really produces regions
    expect(emptyCount).toBe(0);
    // "Roughly doubles": per-event sprite cost varies with the Kennicutt
    // luminosity draw, so this is a band around 2x rather than an exact
    // equality — wide enough to absorb that variance, tight enough that a
    // broken (flat, or window-ignoring) wiring would fall outside it.
    expect(doubledCount).toBeGreaterThan(baseCount * 1.4);
    expect(doubledCount).toBeLessThan(baseCount * 3);
  });

  it('caps admission at HII_MAX_COUNT once eventRate*impulseDuration overruns it, rather than growing unbounded', () => {
    const modest = fluidTuning({ eventRate: 0.1, steps: 80, impulseDuration: 1000 });
    const huge = fluidTuning({ eventRate: 20, steps: 80, impulseDuration: 1000 });

    const modestCount = buildHiiRegions(
      geometry,
      modest,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      null,
    ).length;
    const hugeCount = buildHiiRegions(
      geometry,
      huge,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      null,
    ).length;

    expect(hugeCount).toBeGreaterThan(modestCount);
    // HII_MAX_COUNT bounds the SPRITE budget (shell+cluster sprites, several
    // per region), so the admitted-region count sits well under it.
    expect(hugeCount).toBeLessThanOrEqual(600);
  });

  it("a single fluid event's sprites land at its (az, ring) grid position through the log-polar -> world transform", () => {
    // eventRate*steps rounds to exactly 1, and impulseDuration comfortably
    // exceeds steps so that one event is still "young" at the run's end —
    // arranged, not asserted: the test below re-derives the window
    // independently to confirm the arrangement before trusting it.
    const tuning = fluidTuning({
      eventRate: 0.02,
      steps: 50,
      impulseDuration: 1000,
      clusterStrength: 0,
    });

    const events = buildGalaxyIsmMapFluidEvents(geometry, tuning, geometry.seed);
    const { start, end } = ismMapFluidEventWindow(
      events,
      tuning.ismMapFluid.steps,
      tuning.ismMapFluid.impulseDuration,
    );
    expect(end - start).toBe(1); // arrangement check, not the behaviour under test
    const event = events[start]!;

    // Independent reconstruction of the placement, off SHARED geometry
    // utilities (`ismMapGridRadius`/`ismMapRingRadius`/`warpHeight`) rather
    // than off `hiiRegions.ts`'s own (private) placement function — the same
    // "reuse the shared ridge/grid truth, not the function under test"
    // technique `hiiRegions.test.ts`'s own armBias test uses via
    // `armRidgeAngle`.
    const grid = ismMapGridRadius(geometry);
    const angle = (event.az * 2 * Math.PI) / ISM_MAP_AZ;
    const radius = ismMapRingRadius(event.ring, ISM_MAP_RINGS, grid.rMin, grid.rMax);
    const expectedCenter: [number, number, number] = [
      radius * Math.cos(angle),
      warpHeight(radius, angle, geometry),
      radius * Math.sin(angle),
    ];

    const regions = buildHiiRegions(
      geometry,
      tuning,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      null,
    );
    expect(regions.length).toBeGreaterThan(0);

    // A single HII region's own Strömgren radius is at most a few hundred
    // parsecs (`hiiRegionGeometry.ts`'s `RADIUS_MIN_PC`/`LUMINOSITY_MAX`) —
    // a small fraction of the whole disc's `outerRadius`. Every sprite
    // clustering within that fraction of `expectedCenter` (rather than, say,
    // scattered across the disc via a wrong transform, or sitting on the
    // arm-ridge catalog's placement instead) pins the transform without
    // needing this test to know the region's exact radius.
    const bound = geometry.outerRadius * 0.05;
    for (const component of regions) {
      const dist = Math.hypot(
        component.center[0] - expectedCenter[0],
        component.center[1] - expectedCenter[1],
        component.center[2] - expectedCenter[2],
      );
      expect(dist).toBeLessThan(bound);
    }
  });
});

describe("buildHiiRegions — 'automaton'/'none' fall back to the pre-existing arm-ridge catalog", () => {
  it("'automaton' and 'none' are byte-identical to each other, and neither reacts to ismMapFluid tuning (proving neither reads the fluid path)", () => {
    const automaton: GalaxyFieldTuning = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      ismMap: { generator: 'automaton' },
    };
    const none: GalaxyFieldTuning = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      ismMap: { generator: 'none' },
    };
    const automatonFluidParamsChanged: GalaxyFieldTuning = {
      ...automaton,
      ismMapFluid: {
        ...automaton.ismMapFluid,
        eventRate: automaton.ismMapFluid.eventRate * 50,
        steps: 5,
        impulseDuration: 1,
      },
    };

    const a = buildHiiRegions(
      geometry,
      automaton,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      null,
    );
    const n = buildHiiRegions(
      geometry,
      none,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      null,
    );
    const aFluidChanged = buildHiiRegions(
      geometry,
      automatonFluidParamsChanged,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      null,
    );

    expect(a.length).toBeGreaterThan(0); // sanity: the MW preset's defaults really produce regions
    expect(n).toEqual(a);
    expect(aFluidChanged).toEqual(a);
  });

  it('starFormation.sfActivity still gates the catalog path off at 0, same as before this change', () => {
    const tuning: GalaxyFieldTuning = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      ismMap: { generator: 'automaton' },
    };
    const off = {
      ...DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      sfActivity: 0,
    };
    const regions = buildHiiRegions(geometry, tuning, off, geometry.seed, null);
    expect(regions).toEqual([]);
  });
});

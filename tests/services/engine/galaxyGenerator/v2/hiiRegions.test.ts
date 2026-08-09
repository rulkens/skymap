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
import {
  buildHiiRegions,
  buildHiiRegionsWithSegments,
} from '../../../../../src/services/engine/galaxyGenerator/v2/hiiRegions';
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

/**
 * Busy on exactly ONE channel (the other of `stars`/`activity` left at 0,
 * gas nonzero so admission math elsewhere has something to chew on) — the
 * shell-seeding CDF's disjoint-support probe: `stars` and `activity` never
 * overlap here, so whichever one placement actually reads is the one that
 * moves the output.
 */
function makeChannelHotMap(channel: 'stars' | 'activity'): GalaxyIsmMap {
  const az = 32;
  const rings = 16;
  const data = new Float32Array(rings * az * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0.78;
    if (channel === 'stars') data[i + 1] = 0.7;
    if (channel === 'activity') data[i + 2] = 0.6;
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

  // The stars channel is now a long-lived advected tracer (fluid) / its
  // exp-decay approximation (automaton) — no longer the short-memory signal
  // shell seeding wants. `applyIsmMapSeeding` switched its CDF weight from
  // `stars` to `activity` (see `hiiRegions.ts`'s own header); these two pin
  // that switch against disjoint per-channel maps, since a busy-on-both map
  // (`makeBusyMap`) can't tell which channel actually drove a reseed.
  it('shell/cluster seeding ignores the stars channel: a stars-only map (zero activity) leaves placement byte-identical to no map', () => {
    const tuningOn = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      // Forces the arm-ridge catalog + applyIsmMapSeeding path — the DEFAULT
      // generator is 'fluid', which never calls applyIsmMapSeeding at all
      // (candidateRegionsFromFluidEvents derives centres from the sim
      // itself, ignoring the map object handed in here).
      ismMap: { ...DEFAULT_GALAXY_FIELD_TUNING.ismMap, generator: 'automaton' as const },
      hii: {
        ...DEFAULT_GALAXY_FIELD_TUNING.hii,
        ismMapSeeding: 1,
        dig: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.dig, fraction: 0 },
      },
    };
    const withoutMap = buildHiiRegions(
      geometry,
      tuningOn,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      null,
    );
    const withStarsOnlyMap = buildHiiRegions(
      geometry,
      tuningOn,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      makeChannelHotMap('stars'),
    );
    expect(withStarsOnlyMap).toEqual(withoutMap);
  });

  it('shell/cluster seeding weights by activity: an activity-only map (zero stars) reseeds placement', () => {
    const tuningOn = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      // Same generator override as the previous test, same reason.
      ismMap: { ...DEFAULT_GALAXY_FIELD_TUNING.ismMap, generator: 'automaton' as const },
      hii: {
        ...DEFAULT_GALAXY_FIELD_TUNING.hii,
        ismMapSeeding: 1,
        dig: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.dig, fraction: 0 },
      },
    };
    const withoutMap = buildHiiRegions(
      geometry,
      tuningOn,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      null,
    );
    const withActivityOnlyMap = buildHiiRegions(
      geometry,
      tuningOn,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      makeChannelHotMap('activity'),
    );
    expect(withActivityOnlyMap.length).toBeGreaterThan(0); // sanity: the tier really runs
    expect(withActivityOnlyMap).not.toEqual(withoutMap);
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
        // Zeroed: the young-stars chain places off arm geometry alone
        // (`youngStarChain.ts`), so it would otherwise ride along on BOTH
        // sides of the slice below and desync it from the real DIG block.
        youngStars: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.youngStars, brightness: 0 },
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
        hii: {
          ...DEFAULT_GALAXY_FIELD_TUNING.hii,
          dig: { ...baseDig, armBias },
          // Zeroed — see the previous test's own comment.
          youngStars: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.youngStars, brightness: 0 },
        },
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

  // Board item 19 — shells/dig/young-stars each got their OWN gain,
  // multiplied against the whole-field master rather than one of them
  // (shells, historically) doubling as it. The real bug this catches: a gain
  // that's supposed to be per-tier instead zeroing (or scaling) a SHARED
  // upstream value like `shellFluxSum`, which would move every OTHER tier's
  // output too.
  it('shells.brightness 0 zeroes only the shell/cluster sprites — DIG and young stars survive unchanged', () => {
    const tuningOn = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      hii: {
        ...DEFAULT_GALAXY_FIELD_TUNING.hii,
        dig: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.dig, fraction: 0.35 },
        youngStars: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.youngStars, brightness: 1 },
      },
    };
    const tuningShellsOff = {
      ...tuningOn,
      hii: { ...tuningOn.hii, shells: { ...tuningOn.hii.shells, brightness: 0 } },
    };
    const map = makeBusyMap();

    const withShells = buildHiiRegions(
      geometry,
      tuningOn,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      map,
    );
    const withoutShells = buildHiiRegions(
      geometry,
      tuningShellsOff,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      map,
    );

    expect(withoutShells.length).toBeLessThan(withShells.length); // sanity: shells really contributed something
    // Shells are pushed FIRST (`buildHiiRegions`'s own construction order),
    // so zeroing them removes a clean PREFIX — the remainder is DIG then
    // the young-stars chain, untouched.
    const tail = withShells.slice(withShells.length - withoutShells.length);
    expect(tail).toEqual(withoutShells);
  });

  it("dig.brightness 0 zeroes only DIG's own components — shells and young stars survive unchanged", () => {
    const tuningOn = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      hii: {
        ...DEFAULT_GALAXY_FIELD_TUNING.hii,
        dig: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.dig, fraction: 0.35 },
        youngStars: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.youngStars, brightness: 1 },
      },
    };
    const tuningDigOff = {
      ...tuningOn,
      hii: { ...tuningOn.hii, dig: { ...tuningOn.hii.dig, brightness: 0 } },
    };
    const map = makeBusyMap();

    // DIG sits in the MIDDLE of `out` (shells, then DIG, then the young-stars
    // chain), so a length-only before/after slice can silently straddle two
    // tiers — isolate the shell/cluster PREFIX's own length independently
    // instead of inferring it from a length delta.
    const shellsOnly = buildHiiRegions(
      geometry,
      {
        ...tuningOn,
        hii: {
          ...tuningOn.hii,
          dig: { ...tuningOn.hii.dig, fraction: 0 },
          youngStars: { ...tuningOn.hii.youngStars, brightness: 0 },
        },
      },
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      map,
    );
    const shellCount = shellsOnly.length;

    const withDig = buildHiiRegions(
      geometry,
      tuningOn,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      map,
    );
    const withoutDig = buildHiiRegions(
      geometry,
      tuningDigOff,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      map,
    );

    expect(withoutDig.length).toBeLessThan(withDig.length); // sanity: DIG really contributed something
    const digCount = withDig.length - withoutDig.length;

    expect(withDig.slice(0, shellCount)).toEqual(shellsOnly);
    expect(withDig.slice(0, shellCount)).toEqual(withoutDig.slice(0, shellCount));
    // Young-stars tail identical once DIG's own middle slice is skipped over.
    expect(withDig.slice(shellCount + digCount)).toEqual(withoutDig.slice(shellCount));
  });
});

// The galaxy-renderer tool's timing HUD draws one sub-pass per segment via
// `firstInstance`/`instanceCount` (createGalaxyEngine.ts's `drawFrame`) — a
// gap or overlap between segments would either skip real components or draw
// some of them twice, and a short total would silently drop the tail of
// whichever tier's checkpoint drifted from what actually landed in `out`.
describe('buildHiiRegionsWithSegments', () => {
  it('segments are contiguous, non-overlapping, and sum to the assembled component count', () => {
    const map = makeBusyMap();
    // Defaults alone: `dig.fraction`/`youngStars.brightness` are both nonzero
    // out of the box (see `galaxyFieldMixture.ts`'s `DEFAULT_GALAXY_FIELD_TUNING`),
    // so all three tiers actually contribute on the MW preset.
    const { components, segments } = buildHiiRegionsWithSegments(
      geometry,
      DEFAULT_GALAXY_FIELD_TUNING,
      DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
      geometry.seed,
      map,
    );

    expect(segments.map((s) => s.label)).toEqual(['hii:shells', 'hii:dig', 'hii:young']);
    // Sanity: the MW preset really exercises every tier, or the contiguity
    // assertions below would pass trivially over all-zero segments.
    for (const segment of segments) expect(segment.count).toBeGreaterThan(0);

    let expectedFirst = 0;
    for (const segment of segments) {
      expect(segment.first).toBe(expectedFirst);
      expectedFirst += segment.count;
    }
    expect(expectedFirst).toBe(components.length);
  });
});

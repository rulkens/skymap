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
  ASSOCIATIONS_MAX_COUNT,
  associationSplatCovariance,
  buildHiiRegions,
} from '../../../../../src/services/engine/galaxyGenerator/v2/hiiRegions';
import type { GalaxyIsmMap } from '../../../../../src/@types/galaxy/GalaxyIsmMap';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

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

  // Board item 19 — shells/dig/associations each got their OWN gain,
  // multiplied against the whole-field master rather than one of them
  // (shells, historically) doubling as it. The real bug this catches: a gain
  // that's supposed to be per-tier instead zeroing (or scaling) a SHARED
  // upstream value like `shellFluxSum`, which would move every OTHER tier's
  // output too.
  it('shells.brightness 0 zeroes only the shell/cluster sprites — DIG and associations survive unchanged', () => {
    const tuningOn = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      hii: {
        ...DEFAULT_GALAXY_FIELD_TUNING.hii,
        dig: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.dig, fraction: 0.35 },
        associations: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.associations, brightness: 1 },
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
    // associations, untouched.
    const tail = withShells.slice(withShells.length - withoutShells.length);
    expect(tail).toEqual(withoutShells);
  });

  it("dig.brightness 0 zeroes only DIG's own components — shells and associations survive unchanged", () => {
    const tuningOn = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      hii: {
        ...DEFAULT_GALAXY_FIELD_TUNING.hii,
        dig: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.dig, fraction: 0.35 },
        associations: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.associations, brightness: 1 },
      },
    };
    const tuningDigOff = {
      ...tuningOn,
      hii: { ...tuningOn.hii, dig: { ...tuningOn.hii.dig, brightness: 0 } },
    };
    const map = makeBusyMap();

    // DIG sits in the MIDDLE of `out` (shells, then DIG, then associations),
    // so a length-only before/after slice can silently straddle two tiers —
    // isolate the shell/cluster PREFIX's own length independently instead of
    // inferring it from a length delta.
    const shellsOnly = buildHiiRegions(
      geometry,
      {
        ...tuningOn,
        hii: {
          ...tuningOn.hii,
          dig: { ...tuningOn.hii.dig, fraction: 0 },
          associations: { ...tuningOn.hii.associations, brightness: 0 },
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
    // Associations tail identical once DIG's own middle slice is skipped over.
    expect(withDig.slice(shellCount + digCount)).toEqual(withoutDig.slice(shellCount));
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
    // Associations used to CDF-sample from the map's activity/stars
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
    expect(assn.length).toBeGreaterThan(0);
    expect(assn.length).toBeLessThanOrEqual(ASSOCIATIONS_MAX_COUNT);
  });

  it('associations collapse to one splat per admitted mid-age seed, clamped to ASSOCIATIONS_MAX_COUNT (task #20)', () => {
    // A `complexes` scaler far past what the run's own mid-age population
    // could ever need pins the OTHER end of `deriveComplexCount`'s clamp —
    // the real bug this catches is the cap silently dropping (or doubling,
    // if a childrenPerComplex-shaped multiplier crept back in) once the
    // per-complex children loop was deleted.
    const tuningOn = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      hii: {
        ...DEFAULT_GALAXY_FIELD_TUNING.hii,
        dig: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.dig, fraction: 0 },
        associations: {
          ...DEFAULT_GALAXY_FIELD_TUNING.hii.associations,
          brightness: 1,
          complexes: 100,
        },
      },
    };
    const withoutAssn = buildHiiRegions(
      geometry,
      {
        ...tuningOn,
        hii: { ...tuningOn.hii, associations: { ...tuningOn.hii.associations, brightness: 0 } },
      },
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
    const assn = withAssn.slice(withoutAssn.length);
    expect(assn.length).toBe(ASSOCIATIONS_MAX_COUNT);
  });

  it('associations.complexes scales the splat count directly — no childrenPerComplex multiplier survives the collapse (task #20)', () => {
    // One splat per seed now, so doubling the population scaler should
    // roughly double the output count (bounded by rounding), not move by
    // whatever a stray children-per-complex factor would have produced.
    function countFor(complexes: number): number {
      const tuningOn = {
        ...DEFAULT_GALAXY_FIELD_TUNING,
        hii: {
          ...DEFAULT_GALAXY_FIELD_TUNING.hii,
          dig: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.dig, fraction: 0 },
          associations: {
            ...DEFAULT_GALAXY_FIELD_TUNING.hii.associations,
            brightness: 1,
            complexes,
          },
        },
      };
      const withoutAssn = buildHiiRegions(
        geometry,
        {
          ...tuningOn,
          hii: { ...tuningOn.hii, associations: { ...tuningOn.hii.associations, brightness: 0 } },
        },
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
      return withAssn.length - withoutAssn.length;
    }

    const half = countFor(0.5);
    const full = countFor(1.5);
    expect(half).toBeGreaterThan(0);
    // Rounding gives some slack; a leftover children multiplier would move
    // this ratio to ~3x childrenPerComplex (e.g. 9x at the old default of
    // 3), well outside this window.
    expect(full / half).toBeGreaterThan(2.5);
    expect(full / half).toBeLessThan(3.5);
  });

  // Board 21 — coverage is count x area, and `complexes` alone only ever
  // grew the count. `sizeScale` is the new area lever: multiplies the sigma
  // draw range directly (`ASSN_SIGMA_MIN/MAX_PC`), so it should move
  // `boundRadius` by the SAME factor for every splat, not just some.
  function assnComponentsFor(sizeScale: number) {
    const tuningOn = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      hii: {
        ...DEFAULT_GALAXY_FIELD_TUNING.hii,
        dig: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.dig, fraction: 0 },
        associations: {
          ...DEFAULT_GALAXY_FIELD_TUNING.hii.associations,
          brightness: 1,
          // coherence 1 + elongation 8 (the UI's own ceiling): keeps
          // sigmaAlong = sigma*sqrt(8) safely above ASSN_SCALE_HEIGHT_PC's
          // fixed 150 pc pole sigma across the whole draw range at every
          // sizeScale tested below, so `boundRadius`
          // (= max(sigmaAlong, sigmaAcross, poleSigma)) reads as the drawn
          // sigma itself rather than clipping to the untouched pole term.
          coherence: 1,
          elongation: 8,
          sizeScale,
        },
      },
    };
    const withoutAssn = buildHiiRegions(
      geometry,
      {
        ...tuningOn,
        hii: { ...tuningOn.hii, associations: { ...tuningOn.hii.associations, brightness: 0 } },
      },
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
    return withAssn.slice(withoutAssn.length);
  }

  it('associations.sizeScale scales every drawn splat sigma by the same factor (board 21)', () => {
    // sizeScale only rescales the OUTPUT of the sigma draw, never adds or
    // skips an rng() call, so both runs consume the identical rng sequence —
    // same seeds, same axes, same splat count, same order. Only sigma (and
    // hence boundRadius, dominated by sigmaAlong per the setup above) moves.
    const base = assnComponentsFor(1);
    const doubled = assnComponentsFor(2);
    expect(base.length).toBeGreaterThan(0);
    expect(doubled.length).toBe(base.length);

    for (let i = 0; i < base.length; i++) {
      expect(doubled[i]!.boundRadius / base[i]!.boundRadius).toBeCloseTo(2, 6);
    }
  });

  it("associations.sizeScale grows a splat's footprint without changing its integrated flux (board 21 amplitude discipline)", () => {
    // Splat.wesl reads `amplitude` as a Gaussian coefficient already divided
    // by the sigma volume (`TAU_ROOT3 * sigmaAlong * sigmaAcross * poleSigma`
    // at the push site) — so `amplitude * sigmaAlong * sigmaAcross` is the
    // splat's own integrated in-plane flux, independent of sigma by
    // construction. With elongation pinned at 8 for both runs,
    // `sigmaAlong * sigmaAcross == sigma^2` regardless of sizeScale (the
    // elongation split cancels), and `boundRadius` IS `sigmaAlong` per this
    // suite's own setup above — so `amplitude * boundRadius^2` is that same
    // invariant, checkable straight off the pushed components without
    // re-deriving sigma. A sizeScale that silently brightened the tier
    // (e.g. an amplitude divisor that missed the sizeScale factor) would
    // move this ratio away from 1.
    const base = assnComponentsFor(1);
    const bigger = assnComponentsFor(2.5);
    expect(base.length).toBeGreaterThan(0);
    expect(bigger.length).toBe(base.length);

    for (let i = 0; i < base.length; i++) {
      const fluxBase = base[i]!.amplitude * base[i]!.boundRadius * base[i]!.boundRadius;
      const fluxBigger = bigger[i]!.amplitude * bigger[i]!.boundRadius * bigger[i]!.boundRadius;
      expect(fluxBigger / fluxBase).toBeCloseTo(1, 6);
    }
  });

  it('associations Population at the new 8x slider ceiling still respects ASSOCIATIONS_MAX_COUNT (board 21)', () => {
    // The Population slider's max moved 3 -> 8 (board 21) so the tier has
    // real count headroom; this pins that `deriveComplexCount`'s shared
    // clamp still bounds the result at that new ceiling on a real (MW
    // preset) mid-age population, not just at the synthetic complexes:100
    // used above to force the clamp deliberately.
    const tuningOn = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      hii: {
        ...DEFAULT_GALAXY_FIELD_TUNING.hii,
        dig: { ...DEFAULT_GALAXY_FIELD_TUNING.hii.dig, fraction: 0 },
        associations: {
          ...DEFAULT_GALAXY_FIELD_TUNING.hii.associations,
          brightness: 1,
          complexes: 8,
        },
      },
    };
    const withoutAssn = buildHiiRegions(
      geometry,
      {
        ...tuningOn,
        hii: { ...tuningOn.hii, associations: { ...tuningOn.hii.associations, brightness: 0 } },
      },
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
    const assn = withAssn.slice(withoutAssn.length);
    expect(assn.length).toBeGreaterThan(0);
    expect(assn.length).toBeLessThanOrEqual(ASSOCIATIONS_MAX_COUNT);
  });
});

describe('associationSplatCovariance', () => {
  // A synthetic, deliberately non-axis-aligned orthonormal frame — proves
  // the "major axis follows the drift direction" property holds for an
  // arbitrary seed orientation, not just one that happens to line up with
  // the world axes.
  const along: Vec3 = [Math.SQRT1_2, 0, Math.SQRT1_2];
  const across: Vec3 = [-Math.SQRT1_2, 0, Math.SQRT1_2];
  const pole: Vec3 = [0, 1, 0];

  function matVec(diag: Vec3, offDiag: Vec3, v: Vec3): Vec3 {
    const [m00, m11, m22] = diag;
    const [m01, m02, m12] = offDiag;
    return [
      m00 * v[0] + m01 * v[1] + m02 * v[2],
      m01 * v[0] + m11 * v[1] + m12 * v[2],
      m02 * v[0] + m12 * v[1] + m22 * v[2],
    ];
  }

  it("elongation stretches the SPLAT along the given frame's own along axis, not across or pole", () => {
    const sigma = 1;
    const elongation = 4;
    const poleSigma = 2;
    const { invCovDiagonal, invCovOffDiagonal } = associationSplatCovariance(
      { along, across, pole },
      sigma,
      elongation,
      poleSigma,
    );

    // `along`/`across`/`pole` are eigenvectors of M by construction
    // (inverseCovarianceFromFrame sums k * u u^T over an orthonormal
    // basis), so M*u == eigenvalue*u for each — a real bug swapping
    // along/across, or applying elongation to pole, breaks this check.
    const mAlong = matVec(invCovDiagonal, invCovOffDiagonal, along);
    const mAcross = matVec(invCovDiagonal, invCovOffDiagonal, across);
    const mPole = matVec(invCovDiagonal, invCovOffDiagonal, pole);
    const eigAlong = along[0] !== 0 ? mAlong[0] / along[0] : mAlong[2] / along[2];
    const eigAcross = across[0] !== 0 ? mAcross[0] / across[0] : mAcross[2] / across[2];
    const eigPole = mPole[1] / pole[1];

    expect(eigAlong).toBeCloseTo(1 / (sigma * sigma * elongation), 10);
    expect(eigAcross).toBeCloseTo(elongation / (sigma * sigma), 10);
    expect(eigPole).toBeCloseTo(1 / (poleSigma * poleSigma), 10);
    // The elongated axis is the LEAST constrained (largest sigma, smallest
    // inverse-covariance eigenvalue) — the actual "major axis parallel to
    // drift direction" property splat.wesl's Gaussian relies on.
    expect(eigAlong).toBeLessThan(eigAcross);
    expect(eigAlong).toBeLessThan(eigPole);
  });
});

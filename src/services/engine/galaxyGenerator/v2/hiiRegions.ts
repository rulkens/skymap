/**
 * buildHiiRegions — the young end of the SF-event catalog (`age01 <=
 * HII_AGE_GATE`) as glowing shells: isotropic Gaussian sprites scattered on
 * each event's Stromgren sphere, plus an optional embedded OB cluster. Limb
 * brightening is NOT a rim term — it falls out of line-of-sight column
 * density through a radially-jittered shell, the way a real thin shell does.
 *
 * Flux is ADDITIVE and split across regions by their own `hiiLuminosityOf`
 * draw. PURITY INVARIANT: pure `(geometry, tuning, starFormation, seed,
 * ismMap) -> flat data`, same discipline as `sfEventCatalog.ts`. Drawn by
 * `createGalaxyEngine.ts` into its OWN target (`hiiTex`), never folded into
 * `galaxyFieldMixture.ts`'s output — see research doc §18.1: a shell sprite
 * is small and bright by construction, so sharing the smooth field's
 * downsampled target collapsed it into a bloom firefly.
 */
import {
  HII_AGE_GATE,
  HII_CLUSTER_COLOR,
  hiiLuminosityOf,
  hiiRadiusUnits,
} from './hiiRegionGeometry';
import {
  armCrossSigma,
  armFadeEnvelope,
  armRidgeAngle,
  armRidgeCurvePoint,
} from './armRidgeGeometry';
import { armAgeWeight } from './dustLaneFeatures';
import { ismMapGridRadius, ISM_MAP_AZ, ISM_MAP_RINGS } from './galaxyIsmMapArmForcing';
import type { GalaxyIsmMapGridRadius } from './galaxyIsmMapArmForcing';
import { buildGalaxyIsmMapFluidEvents, ismMapFluidEventWindow } from './galaxyIsmMapFluidEvents';
import { buildSfEventCatalog } from './sfEventCatalog';
import {
  CATALOG_DRIFT_STEPS,
  CATALOG_SHEAR_COROTATION_RADIUS,
  CATALOG_SHEAR_STRENGTH,
  RECENT_EVENT_AGE_FRAC_CEIL,
  deriveComplexCount,
  driftedAssociationSeed,
  fluidMidAgeEventWindow,
  selectAssociationSeeds,
} from './sfEventAgeBands';
import type { AssociationSeedFrame } from './sfEventAgeBands';
import { buildIsmMapDustCdf } from '../../../../utils/galaxy/buildIsmMapDustCdf';
import { inverseCovarianceFromFrame } from '../../../../utils/galaxy/inverseCovarianceFromFrame';
import { pcToUnits } from '../../../../utils/galaxy/pcToUnits';
import { sampleIsmMapDustCdf } from '../../../../utils/galaxy/sampleIsmMapDustCdf';
import { sampleIsmMapEventPosition } from '../../../../utils/galaxy/sampleIsmMapEventPosition';
import { ismMapRingRadius } from '../../../../utils/galaxy/ismMapRingRadius';
import { warpHeight } from '../../../../utils/galaxy/warpHeight';
import { warpSurfaceFrame } from '../../../../utils/galaxy/warpSurfaceFrame';
import { gaussian } from '../../../../utils/random/gaussian';
import { mulberry32 } from '../../../../utils/random/mulberry32';
import type { GalaxyFieldComponent } from '../../../../@types/galaxy/GalaxyFieldComponent';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../@types/galaxy/GalaxyFieldTuning';
import type { GalaxyIsmMap } from '../../../../@types/galaxy/GalaxyIsmMap';
import type { GalaxyIsmMapDustCdf } from '../../../../@types/galaxy/GalaxyIsmMapDustCdf';
import type { GalaxyStarFormationParams } from '../../../../@types/galaxy/GalaxyStarFormationParams';
import type { SfEvent } from '../../../../@types/galaxy/SfEvent';
import type { IsmMapFluidEvent } from '../../../../@types/galaxy/IsmMapFluidEvent';
import type { Vec3 } from '../../../../@types/math/Vec3';

/**
 * Component-budget ceiling for the whole tier. HII draws into its OWN
 * target now (`createGalaxyEngine.ts`'s `hiiTex`/`hiiCompsBuf`), so this is
 * no longer a RESERVATION against `GALAXY_FIELD_MAX_COMPONENTS` — it used to
 * be (`galaxyFieldMixture.ts`'s `pushArmRidges` shrank its own budget to
 * leave room for it), but the two tiers no longer share a cap to fight over.
 * It is now a plain per-galaxy admission ceiling: `planRegions` sorts
 * regions brightest-first and drops the faintest ones once their sprite
 * cost would cross it, which bounds a single galaxy's worst-case component
 * count regardless of how many SF events its catalog produced.
 */
export const HII_MAX_COUNT = 600;

/** Shell sprite count spans this range across the luminosity draw's four decades (`hiiRegionGeometry.ts`'s `LUMINOSITY_MAX = 1e4`) — Orion-class costs ~3, a 30-Doradus-class giant ~40. */
const SHELL_SPRITES_MIN = 3;
const SHELL_SPRITES_MAX = 40;
const SHELL_SPRITE_LUM_DECADES = 4;

/** A handful of tight sprites stand in for the embedded OB association. */
const CLUSTER_SPRITE_COUNT = 3;

/** Sprite sigma as a fraction of the region's own Stromgren radius. */
const SHELL_SPRITE_SIGMA_RATIO = 0.15;
/** The cluster core sits well inside the shell, per the brief's "small relative to the shell". */
const CLUSTER_SPRITE_SIGMA_RATIO = 0.05;
/** Cluster sprites jitter within this fraction of the region radius around its centre. */
const CLUSTER_SPREAD_RATIO = 0.12;

/** Cluster's ceiling share of a region's own flux at `clusterStrength` 1 — a bright core, not a rival to the shell. */
const CLUSTER_FLUX_SHARE_MAX = 0.2;

/**
 * Diffuse ionized gas (DIG) veil — see `GalaxyHiiDigTuning`'s doc for the
 * observational anchor. A complex/children group (`buildDigVeil`) pushed
 * AFTER the catalog regions, not a per-region add-on: DIG isn't tied to any
 * one HII event, it is a separate haze the arms and knots sit inside.
 */
/** Per-blob sigma range, parsecs — wide enough that a complex's blobs read as a continuous wash rather than a second population of dots (no blur pass; this range IS the smoothing). */
const DIG_SIGMA_MIN_PC = 100;
const DIG_SIGMA_MAX_PC = 300;
/** Extraplanar DIG stands well above the disc a razor-thin HII shell sits in (Haffner+2009 review). */
const DIG_SCALE_HEIGHT_PC = 300;
/** Ceiling on `fraction / (1 - fraction)` so a `dig.fraction` near 1 saturates the veil instead of diverging it. */
const DIG_FLUX_RATIO_MAX = 4;
/** Dedicated rng stream salt for the DIG veil draws — distinct from "SFMP"/"HII "/"DUST"/"ARMC". */
const DIG_SALT = 0x44494720; // "DIG "
/**
 * Component-budget ceiling for the DIG veil, exported so a caller sizing a
 * fixed-capacity buffer (`createGalaxyModel.ts`'s `HII_MAX_COUNT +
 * DIG_MAX_COUNT`) has a worst case to reserve against: `dig.complexes` and
 * `dig.childrenPerComplex` are now live-tunable rather than the fixed
 * `150 = complexes*childrenPerComplex` this tier used to hard-code, so their
 * product needs a ceiling the way `HII_MAX_COUNT`/`ARM_CLOUD_MAX_COUNT`
 * already ceiling their own tiers. Sized to the UI's own slider ceilings
 * (120 complexes x 12 children = 1440), not derived from them, so a future
 * slider-range change doesn't silently resize a GPU buffer.
 */
export const DIG_MAX_COUNT = 1440;
/** A complex's child scatter before `dig.elongation` stretches/squeezes it — GMC-association scale, mirroring `dustParticleCloud.ts`'s own `COMPLEX_SPREAD_PC`; an eyeballed starting point, not a measurement. */
const DIG_COMPLEX_SPREAD_PC = 250;
/** Children flatten relative to their complex's in-plane extent — same ratio `clusteredDiscPlacement.ts`'s (private) `CHILD_POLE_RATIO` uses. */
const DIG_CHILD_POLE_RATIO = 0.4;

const TAU_ROOT3 = (2 * Math.PI) ** 1.5;

/** Isotropic sprites don't need an oriented frame — any orthonormal basis gives the same M when all three sigmas match. */
const ISO_FRAME = { along: [1, 0, 0] as Vec3, across: [0, 1, 0] as Vec3, pole: [0, 0, 1] as Vec3 };

/**
 * This tier's share of the galaxy's total `luminosity` at `brightness` 1 —
 * the same anchor every smooth-field tier scales off, which is what keeps
 * this ADDITIVE tier the same order of magnitude as the disc it sits on top
 * of (it owes the disc no debit, so a comparable scale is all it needs).
 * Eyeballed to land the Milky Way's HII-to-disc flux ratio around 1:10, then
 * carried across each re-anchoring exactly rather than re-eyeballed: 0.078915
 * against the pre-decomposition scale, divided by the 1.155747 that scale
 * absorbed when the population multipliers folded into `luminosity`. A
 * starting point for visual calibration, not a measurement — but now a
 * readable one, since `luminosity` is the galaxy's whole emitted light: HII
 * regions add 6.8% of it back on top.
 */
const HII_LUMINOSITY_SHARE = 0.068280788;

/**
 * ROOT MASTER only (board item 19) — the per-region split below feeds
 * `shellFluxSum`/`clusterFluxSum`, the anchors `buildDigVeil`/
 * `buildBlueAssociations` scale their OWN gain against, so this must stay
 * free of `shells.brightness` or that gain would leak into DIG/associations
 * too. `shells.brightness` is applied only to the amplitudes pushed below.
 */
function tierFlux(geometry: GalaxyDescription, tuning: GalaxyFieldTuning): number {
  return geometry.luminosity * HII_LUMINOSITY_SHARE * Math.max(0, tuning.hii.brightness);
}

function shellSpriteCount(luminosity: number): number {
  const t = Math.min(
    1,
    Math.max(0, Math.log10(Math.max(1, luminosity)) / SHELL_SPRITE_LUM_DECADES),
  );
  return Math.round(SHELL_SPRITES_MIN + (SHELL_SPRITES_MAX - SHELL_SPRITES_MIN) * t);
}

function randomDirection(rng: () => number): Vec3 {
  const v: Vec3 = [gaussian(rng), gaussian(rng), gaussian(rng)];
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

type RegionPlan = {
  readonly center: Vec3;
  readonly radius: number;
  readonly luminosity: number;
  readonly shellCount: number;
  readonly clusterCount: number;
};

/** World centre of one SF event, resolved on the warp surface — identical technique to `dustBubblePlacements.ts`, not re-derived. */
function eventCenter(event: SfEvent, geometry: GalaxyDescription): Vec3 | undefined {
  const arm = geometry.arms[event.armIndex];
  if (!arm) return undefined;
  const armRadius = geometry.armStartRadius * Math.exp(event.logR);
  const angle = armRidgeAngle(event.logR, geometry, arm);
  const ridge = armRidgeCurvePoint(event.logR, geometry, arm);
  const frame = warpSurfaceFrame(armRadius, angle, geometry);
  return [
    ridge[0] + frame.across[0] * event.acrossOffset,
    ridge[1] + frame.across[1] * event.acrossOffset,
    ridge[2] + frame.across[2] * event.acrossOffset,
  ];
}

/**
 * Sorted brightest-first, each candidate admitted if it still fits under
 * `HII_MAX_COUNT` — cheap and unbiased because the L^-2-shaped luminosity
 * draw means the tail being dropped carries almost none of the tier's total
 * flux. Shared by both candidate sources below so admission (and hence the
 * cap-scaling story in the module header) doesn't fork per generator.
 */
function admitBrightestFirst(candidates: readonly RegionPlan[]): readonly RegionPlan[] {
  const sorted = [...candidates].sort((a, b) => b.luminosity - a.luminosity);
  const kept: RegionPlan[] = [];
  let used = 0;
  for (const region of sorted) {
    const cost = region.shellCount + region.clusterCount;
    if (used + cost > HII_MAX_COUNT) continue;
    kept.push(region);
    used += cost;
  }
  return kept;
}

function candidateRegionsFromCatalog(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
  starFormation: GalaxyStarFormationParams,
  seed: number,
  clusterCount: number,
): RegionPlan[] {
  const events = buildSfEventCatalog(geometry, starFormation, tuning, seed);
  const all: RegionPlan[] = [];
  for (const event of events) {
    if (event.age01 > HII_AGE_GATE) continue;
    const luminosity = hiiLuminosityOf(event);
    // `?? 1`: board 19 moved this off `hii` root onto `hii.shells` — a
    // partial-shells-bag preset (see `migrateGalaxyFieldTuningWire`'s own
    // comment) can re-enter with this hole; 1 is the law exactly.
    const radius = hiiRadiusUnits(luminosity, tuning.hii.shells.radiusScale ?? 1);
    if (radius <= 0) continue;
    const center = eventCenter(event, geometry);
    if (!center) continue;
    all.push({
      center,
      radius,
      luminosity,
      shellCount: shellSpriteCount(luminosity),
      clusterCount,
    });
  }
  return all;
}

/**
 * World centre of one fluid-sim event, resolved off its (az, ring) log-polar
 * grid coordinate — the SAME radius/angle -> world formula
 * `sampleIsmMapEventPosition.ts` uses for its CDF-sampled placements
 * (`x = r cos θ, y = warpHeight(r, θ), z = r sin θ`), just fed a texel-exact
 * (radius, angle) instead of a CDF-jittered one: a fluid event's own `az`/
 * `ring` already carries the sub-texel jitter `buildGalaxyIsmMapFluidEvents`
 * drew, so there is no second jitter draw to make here.
 */
function fluidEventCenter(
  event: IsmMapFluidEvent,
  geometry: GalaxyDescription,
  grid: GalaxyIsmMapGridRadius,
): Vec3 {
  const angle = (event.az * 2 * Math.PI) / ISM_MAP_AZ;
  const radius = ismMapRingRadius(event.ring, ISM_MAP_RINGS, grid.rMin, grid.rMax);
  return [radius * Math.cos(angle), warpHeight(radius, angle, geometry), radius * Math.sin(angle)];
}

/**
 * Candidates for `tuning.ismMap.generator === 'fluid'`: the fluid sim's own
 * event list, windowed to the ones STILL YOUNG at the end of the run
 * (`ismMapFluidEventWindow` at `step = fluid.steps` — the same
 * `birthStep in (steps - impulseDuration, steps]` age test
 * `ismMapFluidStep.wesl` itself uses to decide an event is active), so region
 * COUNT tracks `eventRate * impulseDuration` pre-cap instead of a parallel,
 * map-blind catalog.
 *
 * SEED CONTRACT: rebuilds the event list here rather than threading the
 * fluid runner's own array across the src/tools boundary — cheap
 * (`buildGalaxyIsmMapFluidEvents` is pure and capped at `ISM_MAP_FLUID_MAX_EVENTS`)
 * and avoids plumbing a live event list through every `hiiMixtureOf` call
 * site. This is sound ONLY because `createIsmMapFluidRunner.ts`'s `rebuild`
 * and this module's caller (`buildHiiRegions`, via `createGalaxyModel.ts`'s
 * `hiiMixtureOf`) are handed the SAME seed bits: the runner gets
 * `currentSeed()` (`normalizeGenerationSeed(lastParams?.seed)`, signed
 * int32), this gets `geometry.seed` (the SAME value `>>> 0`-reinterpreted at
 * `describeGalaxy.ts`'s pack site) — both collapse to the identical int32
 * once XORed against `buildGalaxyIsmMapFluidEvents`' own salt, so the two
 * calls reproduce the SAME event list. If either call site ever derives its
 * seed differently, this silently detaches HII placement from the sim.
 *
 * `luminosity`/`radius` reuse `hiiLuminosityOf`/`hiiRadiusUnits` verbatim
 * (unchanged units, unchanged shell/cluster machinery downstream) rather than
 * inventing a texel-space size law: `strength` is normalized against
 * `fluid.impulseStrength` into the same [~0.2, ~0.8] `u` range
 * `hiiLuminosityOf` expects, and `radiusScale` becomes a per-event
 * multiplier (ratio to `fluid.radiusScale`, ~[0.7, 1.3]) on `tuning.hii.
 * radiusScale` rather than a second, texel-to-parsec unit conversion. No age
 * modulation: `RegionPlan` (and `hiiLuminosityOf`/`hiiRadiusUnits`) carry no
 * age-adjacent field to hang one off, so the mapping stays this minimal
 * rather than inventing one.
 */
function candidateRegionsFromFluidEvents(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
  seed: number,
  clusterCount: number,
): RegionPlan[] {
  const fluid = tuning.ismMapFluid;
  const events = buildGalaxyIsmMapFluidEvents(geometry, tuning, seed);
  const { start, end } = ismMapFluidEventWindow(events, fluid.steps, fluid.impulseDuration);
  if (start >= end) return [];

  const grid = ismMapGridRadius(geometry);
  const all: RegionPlan[] = [];
  for (let i = start; i < end; i++) {
    const event = events[i]!;
    const strengthFactor = fluid.impulseStrength > 0 ? event.strength / fluid.impulseStrength : 1;
    const luminosity = hiiLuminosityOf({ strength: strengthFactor });
    const radiusFactor = fluid.radiusScale > 0 ? event.radiusScale / fluid.radiusScale : 1;
    const radius = hiiRadiusUnits(luminosity, (tuning.hii.shells.radiusScale ?? 1) * radiusFactor);
    if (radius <= 0) continue;
    all.push({
      center: fluidEventCenter(event, geometry, grid),
      radius,
      luminosity,
      shellCount: shellSpriteCount(luminosity),
      clusterCount,
    });
  }
  return all;
}

function planRegions(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
  starFormation: GalaxyStarFormationParams,
  seed: number,
): readonly RegionPlan[] {
  const clusterCount = (tuning.hii.shells.clusterStrength ?? 0.6) > 0 ? CLUSTER_SPRITE_COUNT : 0;
  const candidates =
    tuning.ismMap.generator === 'fluid'
      ? candidateRegionsFromFluidEvents(geometry, tuning, seed, clusterCount)
      : candidateRegionsFromCatalog(geometry, tuning, starFormation, seed, clusterCount);
  return admitBrightestFirst(candidates);
}

/**
 * Lifecycle population behind the DIG veil and blue-association tiers (task
 * #10): `youngCount` is the same young-event population `planRegions` admits
 * into HII shells (recomputed here rather than threaded — the whole SF-event
 * catalog is cheap and pure, the same "recompute over thread" call
 * `candidateRegionsFromFluidEvents`'s own header already makes), and
 * `midAgeSeeds` is one drifted association seed per event whose age sits in
 * `(youngGate, RECENT_EVENT_AGE_FRAC_CEIL]` — B/A stars that have outlived
 * their HII shell but haven't faded yet.
 *
 * Catalog mode's `ageSteps`/shear params are the FIXED `CATALOG_*` constants
 * (`sfEventAgeBands.ts`), never `tuning.ismMapFluid` — see that module's own
 * doc for the "automaton'/'none' stay fluid-tuning-deaf" invariant this
 * protects.
 */
function resolveEventLifecyclePopulation(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
  starFormation: GalaxyStarFormationParams,
  seed: number,
): { readonly youngCount: number; readonly midAgeSeeds: readonly AssociationSeedFrame[] } {
  const driftStrength = tuning.hii.associations?.armBias ?? 0;

  if (tuning.ismMap.generator === 'fluid') {
    const fluid = tuning.ismMapFluid;
    const events = buildGalaxyIsmMapFluidEvents(geometry, tuning, seed);
    const young = ismMapFluidEventWindow(events, fluid.steps, fluid.impulseDuration);
    const midAge = fluidMidAgeEventWindow(events, fluid.steps, fluid.impulseDuration);
    const grid = ismMapGridRadius(geometry);
    const midAgeSeeds: AssociationSeedFrame[] = [];
    for (let i = midAge.start; i < midAge.end; i++) {
      const event = events[i]!;
      const angle = (event.az * 2 * Math.PI) / ISM_MAP_AZ;
      const radius = ismMapRingRadius(event.ring, ISM_MAP_RINGS, grid.rMin, grid.rMax);
      const center = fluidEventCenter(event, geometry, grid);
      const ageSteps = fluid.steps - event.birthStep;
      midAgeSeeds.push(
        driftedAssociationSeed(
          center,
          radius,
          angle,
          ageSteps,
          driftStrength,
          fluid.corotationRadius,
          fluid.shearStrength,
          geometry,
        ),
      );
    }
    return { youngCount: young.end - young.start, midAgeSeeds };
  }

  const events = buildSfEventCatalog(geometry, starFormation, tuning, seed);
  let youngCount = 0;
  const midAgeSeeds: AssociationSeedFrame[] = [];
  for (const event of events) {
    if (event.age01 <= HII_AGE_GATE) {
      youngCount++;
      continue;
    }
    if (event.age01 > RECENT_EVENT_AGE_FRAC_CEIL) continue;
    const arm = geometry.arms[event.armIndex];
    if (!arm) continue;
    const radius = geometry.armStartRadius * Math.exp(event.logR);
    const angle = armRidgeAngle(event.logR, geometry, arm);
    const center = eventCenter(event, geometry);
    if (!center) continue;
    const ageSteps = event.age01 * CATALOG_DRIFT_STEPS;
    midAgeSeeds.push(
      driftedAssociationSeed(
        center,
        radius,
        angle,
        ageSteps,
        driftStrength,
        CATALOG_SHEAR_COROTATION_RADIUS,
        CATALOG_SHEAR_STRENGTH,
        geometry,
      ),
    );
  }
  return { youngCount, midAgeSeeds };
}

/** Dedicated rng stream salt for the map-position draws — distinct from "HII " (sprite scatter) and "DUST"/"ARMC". */
const ISM_MAP_POSITION_SALT = 0x53464d50; // "SFMP"

/**
 * Last-value memo for one of the three per-call `buildIsmMapDustCdf` builds
 * below — each is an O(rings x az [x arms]) pass that a tuning drag outside
 * that tier's own discriminant (map identity, `armBias`, `arms.widthScale`)
 * leaves byte-identical, since `buildIsmMapDustCdf` is a pure function of
 * exactly those inputs. `createGalaxyModel.ts` keeps `ismMap`/`geometry`
 * reference-stable across a `setFieldTuning` call that doesn't touch them,
 * so a single slot per tier is enough: only the CENTRAL galaxy's call ever
 * hands in a non-null `ismMap` (extras pass `null` and never reach these three
 * builders), so nothing else contends for the slot within one rebuild. Sound
 * under ANY interleaving regardless — a key miss just rebuilds — so this can
 * only cost performance, never correctness.
 */
type CachedCdf = { readonly key: readonly unknown[]; readonly cdf: GalaxyIsmMapDustCdf };

function sameCdfKey(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

function cachedCdf(
  cache: CachedCdf | null,
  key: readonly unknown[],
  build: () => GalaxyIsmMapDustCdf,
): CachedCdf {
  return cache && sameCdfKey(cache.key, key) ? cache : { key, cdf: build() };
}

let seedingCdfCache: CachedCdf | null = null;

/**
 * applyIsmMapSeeding — a POST-PASS over `planRegions`' output rather than a
 * resolver threaded into it: admission (which events survive `HII_MAX_COUNT`)
 * depends only on luminosity, never on where an event ends up, so replacing
 * `center` afterward changes nothing about which regions exist — it keeps
 * `planRegions` pure and the `ismMapSeeding === 0` path byte-identical, with
 * no seeding-aware branch inside the admission logic itself.
 *
 * FIXED 4 draws per kept region (1 blend decision + 3 from
 * `sampleIsmMapEventPosition`'s CDF sample) whether or not that region takes
 * the map path — `sampleIsmMapEventPosition` runs unconditionally below — so
 * moving the `ismMapSeeding` slider only ever changes which regions swap
 * centres, never the rng draws (and hence positions) of the ones that don't.
 *
 * Weighted by `activity` alone (the short-memory EMA of event stamps), NOT
 * the `stars` channel `hiiRegions.ts` used to read here: `stars` is now a
 * long-lived advected tracer (fluid) or its exp-decay approximation
 * (automaton), so a shell CDF-sampled from it would scatter onto 20-100 Myr
 * drifted material with no ionizing stars left — shells need FRESH sites,
 * which `activity` still gives (ignition zeroes gas in the same cell, so
 * this stays anti-correlated with the dust CDF by construction — knots avoid
 * the dust the automaton just cleared, the same decorrelation M74 shows,
 * Chevance+2020).
 *
 * NEVER called for `tuning.ismMap.generator === 'fluid'` regions (see
 * `buildHiiRegions`'s call site) — a fluid region's centre already IS a map
 * position (`candidateRegionsFromFluidEvents`'s own log-polar transform), so
 * re-jittering it onto this CDF would undo the exact placement-sim
 * correlation the fluid path exists to create, not refine it.
 */
function applyIsmMapSeeding(
  regions: readonly RegionPlan[],
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
  ismMap: GalaxyIsmMap | null,
  seed: number,
): readonly RegionPlan[] {
  const weight = tuning.hii.ismMapSeeding ?? 0; // undefined (pre-feature stored tuning) means OFF
  if (weight <= 0 || !ismMap || regions.length === 0) return regions;

  // `activity` alone, no tuning input at all — this CDF's only discriminant
  // is the map itself, so the cache key is just `ismMap`.
  seedingCdfCache = cachedCdf(seedingCdfCache, [ismMap], () =>
    buildIsmMapDustCdf(ismMap, (texel) => texel.activity),
  );
  const cdf = seedingCdfCache.cdf;
  if (!(cdf.total > 0)) return regions;

  const rng = mulberry32(seed ^ ISM_MAP_POSITION_SALT);
  return regions.map((region) => {
    const takeMap = rng() < weight;
    const mapCenter = sampleIsmMapEventPosition(cdf, geometry, rng);
    return takeMap ? { ...region, center: mapCenter } : region;
  });
}

/**
 * A DIG/association complex's local flow-direction frame — the azimuthal
 * tangent (`warpSurfaceFrame`), the default "flow direction" since both
 * tiers shear azimuthally. Flat reference height (`point[1] = 0`); the true
 * warp lift is applied per CHILD below, at that child's own (x, z), not
 * baked into the seed.
 */
type DigSeedFrame = {
  readonly point: Vec3;
  readonly along: Vec3;
  readonly across: Vec3;
  readonly pole: Vec3;
};

/**
 * A DIG or association complex CDF-sampled from its tier's own map density
 * (`buildDigVeil`'s `activity` CDF, `buildBlueAssociations`'s
 * `associationDensity` one) — the ONE substrate every complex draws from.
 * `armBias` no longer forks this into a second, arm-lane placement path (see
 * `buildArmProximityEnvelope`): it reweights the CDF itself before this ever
 * runs, so a caller doesn't need to know it exists.
 */
function placeDigMapComplex(
  rng: () => number,
  geometry: GalaxyDescription,
  cdf: GalaxyIsmMapDustCdf,
): DigSeedFrame {
  const { radius, angle } = sampleIsmMapDustCdf(cdf, rng);
  const point: Vec3 = [radius * Math.cos(angle), 0, radius * Math.sin(angle)];
  const surf = warpSurfaceFrame(radius, angle, geometry);
  return { point, along: surf.along, across: surf.across, pole: surf.pole };
}

/**
 * arm-proximity reweighting kernel for `armBias` — how close a (radius,
 * angle) point sits to ANY arm's ridge, age-weighted the way the arm-lane
 * picker this replaced used to weight WHICH arm to draw from
 * (`armAgeWeight`). Radius-keyed memo rather than a caller-driven per-ring
 * table: `buildIsmMapDustCdf`'s own loop is ring-major (the same radius
 * repeats `az` times before the next ring), so caching on "radius changed
 * since the last call" gets the one-recompute-per-ring cost without this
 * function needing to know a ring loop drives it.
 *
 * Cross-arm distance is the small-angle arc length `radius * deltaAngle`
 * against `armCrossSigma`'s own Gaussian width (matches `pushArmRidges`'s
 * blob sigma in `galaxyFieldMixture.ts`) — a 2D approximation in the texel's
 * own (radius, angle) plane, not the 3D warped ridge `armRidgeCurvePoint`
 * traces, which this density-only reweighting doesn't need.
 */
function buildArmProximityEnvelope(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
): (radius: number, angle: number) => number {
  const arms = geometry.arms;
  if (arms.length === 0) return () => 0;
  const ageWeights = arms.map((arm) => armAgeWeight(arm));
  const maxAgeWeight = Math.max(...ageWeights);

  let cachedRadius = NaN;
  let invSigma = 0;
  const ridgeAngles = new Array<number>(arms.length);
  const weights = new Array<number>(arms.length);

  function refresh(radius: number): void {
    cachedRadius = radius;
    const logR = Math.log(radius / geometry.armStartRadius);
    const sigma = armCrossSigma(radius, geometry, tuning);
    invSigma = sigma > 0 ? 1 / sigma : 0;
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i]!;
      ridgeAngles[i] = armRidgeAngle(logR, geometry, arm);
      weights[i] = (ageWeights[i]! / maxAgeWeight) * armFadeEnvelope(radius, geometry, arm);
    }
  }

  return (radius: number, angle: number): number => {
    if (radius !== cachedRadius) refresh(radius);
    if (invSigma <= 0) return 0;
    let acc = 0;
    for (let i = 0; i < arms.length; i++) {
      const w = weights[i]!;
      if (w <= 0) continue;
      const raw = angle - ridgeAngles[i]!;
      const wrapped = raw - 2 * Math.PI * Math.round(raw / (2 * Math.PI));
      const z = radius * wrapped * invSigma;
      acc += w * Math.exp(-0.5 * z * z);
    }
    return Math.min(1, acc);
  };
}

/**
 * `mix(1, envelope(radius, angle), armBias)` applied multiplicatively to a
 * tier's own channel density — 0 leaves `base` untouched (this is what keeps
 * `armBias` a pure reweighting rather than a second placement density), 1
 * replaces it with the arm-proximity weight outright. `armBias <= 0` skips
 * the envelope call entirely, so the off setting never pays for the `exp()`
 * this runs per texel at `armBias > 0`.
 */
function armBiasedDensity(
  base: number,
  armBias: number,
  envelope: (radius: number, angle: number) => number,
  radius: number,
  angle: number,
): number {
  if (armBias <= 0) return base;
  return base * (1 + armBias * (envelope(radius, angle) - 1));
}

/**
 * Blends a seed's in-plane scatter axes toward a fresh random direction —
 * `dig.coherence` 1 keeps them exactly as `placeDigMapComplex` returned
 * them, 0 rotates them to a uniformly random angle. The same in-plane 2D
 * rotation `clusteredDiscPlacement.ts`'s `rotateFrameToOrientation` applies
 * for ITS coherence blend (toward a map-MEASURED angle, not a random one) —
 * `pole` never moves there either. `rng` is drawn unconditionally so the
 * draw order never shifts with the coherence knob.
 */
function scatterAxesForCoherence(
  frame: DigSeedFrame,
  coherence: number,
  rng: () => number,
): { readonly along: Vec3; readonly across: Vec3 } {
  const theta = (1 - coherence) * (rng() * 2 * Math.PI - Math.PI);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return {
    along: [
      frame.along[0] * cos + frame.across[0] * sin,
      frame.along[1] * cos + frame.across[1] * sin,
      frame.along[2] * cos + frame.across[2] * sin,
    ],
    across: [
      frame.across[0] * cos - frame.along[0] * sin,
      frame.across[1] * cos - frame.along[1] * sin,
      frame.across[2] * cos - frame.along[2] * sin,
    ],
  };
}

/**
 * buildDigVeil — the DIG tier's own complex/children placement (see
 * `GalaxyHiiDigTuning`): `dig.complexes` seeds CDF-sampled from the map's
 * `activity` channel (`armBias` reweights that SAME CDF toward the arm
 * envelope rather than forking a second placement path — see
 * `buildArmProximityEnvelope`), each scattering `dig.childrenPerComplex`
 * blobs area-preservingly along/across its local flow direction
 * (`dig.elongation`, `dig.coherence`) — mirrors `dustParticleCloud.ts`'s S3
 * aspect convention (`along = spread*sqrt(e)`, `across = spread/sqrt(e)`).
 *
 * Gated (and its rng stream only consulted) when `dig.fraction > 0`, a map
 * is handed in, and that map's `activity` CDF has nonzero mass — same
 * discipline `buildHiiRegions`' old inline block used. Total flux is
 * anchored to `shellFluxSum` (the shell tier's own flux, not `totalFlux`),
 * because the cluster share folded into `totalFlux` is stellar continuum,
 * not Hα — see that binding's own comment at the call site.
 *
 * `dig.complexes` is now a SCALER on `recentEventCount` (task #10) rather
 * than an absolute count — `recentEventCount` (young + mid-age events, see
 * `resolveEventLifecyclePopulation`) can run into the hundreds on an active
 * fluid run, far more than a diffuse HAZE should ever resolve into discrete
 * complexes, so `DIG_COMPLEXES_PER_EVENT` scales it down to the tier's own
 * population before `deriveComplexCount`'s scaler/clamp — a starting point
 * for visual calibration, not a measurement.
 */
const DIG_COMPLEXES_PER_EVENT = 0.12;

let digCdfCache: CachedCdf | null = null;

function buildDigVeil(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
  ismMap: GalaxyIsmMap | null,
  shellFluxSum: number,
  recentEventCount: number,
  seed: number,
): readonly GalaxyFieldComponent[] {
  // Stale-stored-tuning guard: a preset saved before this knob existed
  // carries an `hii` section with no `dig` object at all — missing means
  // DIG OFF, the same "undefined = pre-feature stored tuning" discipline
  // `applyIsmMapSeeding` uses for `ismMapSeeding` just above.
  const dig = tuning.hii.dig;
  if (!dig || !ismMap) return [];
  const fraction = Math.min(0.999, Math.max(0, dig.fraction));
  // `?? 1`: stale-stored-tuning guard for this tier's own gain (board item
  // 19), same discipline `dig.texture` already carries below.
  const digBrightness = dig.brightness ?? 1;
  if (fraction <= 0 || digBrightness <= 0 || !(dig.elongation > 0)) return [];

  const armBias = Math.min(1, Math.max(0, dig.armBias));
  // Discriminant is (map, geometry [proxy for `arms`], `arms.widthScale`,
  // `armBias`) — everything else `buildArmProximityEnvelope`/`armBiasedDensity`
  // read is baked into one of those four. `envelope` only gets built on a
  // cache miss, so a `complexes`/`elongation`/`coherence`/`texture` drag
  // (this tier's actually-common sliders) skips both the envelope setup AND
  // the CDF's O(rings x az x arms) sweep.
  digCdfCache = cachedCdf(digCdfCache, [ismMap, geometry, tuning.arms.widthScale, armBias], () => {
    const envelope = buildArmProximityEnvelope(geometry, tuning);
    return buildIsmMapDustCdf(ismMap, (texel, radius, angle) =>
      armBiasedDensity(texel.activity, armBias, envelope, radius, angle),
    );
  });
  const cdf = digCdfCache.cdf;
  if (!(cdf.total > 0)) return [];

  const digRatio = Math.min(DIG_FLUX_RATIO_MAX, fraction / (1 - fraction));
  // `shellFluxSum` already carries the root master (`tierFlux`'s own doc) —
  // `digBrightness` layers DIG's own gain on top without re-applying it.
  const digTotalFlux = digRatio * shellFluxSum * digBrightness;
  if (!(digTotalFlux > 0)) return [];

  const childrenPerComplex = Math.max(0, Math.round(dig.childrenPerComplex));
  if (childrenPerComplex <= 0 || dig.complexes <= 0) return [];
  // Complex count clamped to DIG_MAX_COUNT's own budget rather than
  // truncating a partial trailing complex: fewer, smaller complexes read as
  // a thinner veil, not a veil with one oddly-stunted complex.
  const complexes = deriveComplexCount(
    recentEventCount * DIG_COMPLEXES_PER_EVENT,
    dig.complexes,
    childrenPerComplex,
    DIG_MAX_COUNT,
  );
  if (complexes <= 0) return [];
  const totalChildren = complexes * childrenPerComplex;

  const elongation = dig.elongation;
  const coherence = Math.min(1, Math.max(0, dig.coherence));
  const complexSpread = pcToUnits(DIG_COMPLEX_SPREAD_PC);

  const rng = mulberry32(seed ^ DIG_SALT);
  const digAmplitudeBase = digTotalFlux / totalChildren;
  const digColor = geometry.hiiPalette.halo;
  // Stale-stored-tuning guard, same discipline `dig.armBias` et al. already
  // get from this function's own `!dig` early-return — a preset saved before
  // this knob existed carries a `dig` object with no `texture` key.
  const digTextureWeight = dig.texture ?? 0;

  const out: GalaxyFieldComponent[] = [];
  for (let c = 0; c < complexes; c++) {
    const seedFrame = placeDigMapComplex(rng, geometry, cdf);
    const axes = scatterAxesForCoherence(seedFrame, coherence, rng);

    for (let ch = 0; ch < childrenPerComplex; ch++) {
      const offAlong = gaussian(rng) * complexSpread * Math.sqrt(elongation);
      const offAcross = (gaussian(rng) * complexSpread) / Math.sqrt(elongation);
      const offPole = gaussian(rng) * complexSpread * DIG_CHILD_POLE_RATIO;
      const x =
        seedFrame.point[0] +
        axes.along[0] * offAlong +
        axes.across[0] * offAcross +
        seedFrame.pole[0] * offPole;
      const z =
        seedFrame.point[2] +
        axes.along[2] * offAlong +
        axes.across[2] * offAcross +
        seedFrame.pole[2] * offPole;
      const yFlat =
        seedFrame.point[1] +
        axes.along[1] * offAlong +
        axes.across[1] * offAcross +
        seedFrame.pole[1] * offPole;
      // Warp lift at THIS CHILD's own (x, z) — `seedFrame.point` sits at the
      // flat reference height, never lifted (`placeDigMapComplex`'s own doc).
      const y = yFlat + warpHeight(Math.hypot(x, z), Math.atan2(z, x), geometry);
      // Extraplanar scatter on top of the in-plane placement above — DIG
      // stands thicker off the disc than a single HII shell (Haffner+2009).
      const height = y + gaussian(rng) * pcToUnits(DIG_SCALE_HEIGHT_PC);
      const sigma = pcToUnits(DIG_SIGMA_MIN_PC + (DIG_SIGMA_MAX_PC - DIG_SIGMA_MIN_PC) * rng());
      out.push({
        amplitude: digAmplitudeBase / (TAU_ROOT3 * sigma * sigma * sigma),
        ...inverseCovarianceFromFrame(ISO_FRAME, { along: sigma, across: sigma, pole: sigma }),
        color: digColor,
        center: [x, height, z],
        boundRadius: sigma,
        textureWeight: digTextureWeight,
      });
    }
  }
  return out;
}

/**
 * Blue OB-association tier (see `GalaxyHiiAssociationsTuning`): the exposed
 * phase-3 population left once an HII region's gas is expelled (~5 Myr) and
 * its shell fades — a naked cluster, visible ~50-100 Myr, drifted downstream
 * of the gas lane that formed it. Seeded directly off
 * `resolveEventLifecyclePopulation`'s `midAgeSeeds` (one per mid-age SF
 * event, already carrying the shear-drift displacement) rather than
 * CDF-sampled from the map the way `buildDigVeil` seeds DIG — DIG is a
 * steady-state phase with no single birth site, this tier's whole point is
 * that it HAS one.
 *
 * SINGLE SPLAT PER SEED (task #20): the old complex/children structure
 * (many small isotropic sprites scattered around a seed) existed so an
 * untextured splat could fake extent and grain through particle COUNT —
 * redundant now that the dedicated star-grain texture (splat.wesl's
 * starGrainTerm) supplies the "many unresolved stars" look per-fragment, and
 * strictly more expensive (heavily overlapping children in this pass's own
 * close-zoom hotspot). One ANISOTROPIC splat per admitted seed instead:
 * `elongation` now honestly stretches the SPLAT's own covariance along the
 * seed's local drift/flow axis (`seedFrame.along`, from
 * `driftedAssociationSeed`) rather than scattering children along it — see
 * `associationSplatCovariance`.
 */
/** Same footprint the "fewer, larger splats" redesign (task #10) settled on — now the size of the ONE splat per seed rather than of each of several children. */
const ASSN_SIGMA_MIN_PC = 80;
const ASSN_SIGMA_MAX_PC = 260;
/** Associations haven't diffused off the disc the way DIG has (300 pc) — still close to their birth height. Now the splat's own POLE sigma (a real vertical extent) rather than a per-child height jitter. */
const ASSN_SCALE_HEIGHT_PC = 150;
/** Dedicated rng stream salt — distinct from "SFMP"/"HII "/"DUST"/"ARMC"/"DIG ". */
const ASSN_SALT = 0x4153534e; // "ASSN"
/** Splat-count ceiling, sized to `HiiSection.tsx`'s own slider maxima, not derived from them — see `DIG_MAX_COUNT`'s own doc for why. One splat per seed now (task #20), so this is a straight count ceiling, not a `complexes x childrenPerComplex` product. */
export const ASSOCIATIONS_MAX_COUNT = 1800;

/**
 * `assn.complexes` is a SCALER on the mid-age event population (task #10)
 * rather than an absolute count — `ASSN_COMPLEXES_PER_EVENT` scales
 * `midAgeSeeds.length` down to a sensible splat population before
 * `deriveComplexCount`'s scaler/clamp: even one big splat per event would
 * overpopulate a busy run, so far from every mid-age event should spawn its
 * own splat. A starting point for visual calibration, not a measurement.
 */
const ASSN_COMPLEXES_PER_EVENT = 0.15;

/** Subtle cool/hot spread around the cluster's own stellar-continuum colour — `hiiCorePerturbed`'s nudge-and-clamp mechanism (`generate.wesl`), blue-anchored instead of `gen.hiiCore`. */
const ASSN_COLOR_JITTER_MAX = 0.15;
function associationSplatColor(rng: () => number): Vec3 {
  const jitter = rng() * ASSN_COLOR_JITTER_MAX;
  return [
    HII_CLUSTER_COLOR[0] * (1 - jitter),
    Math.min(1, HII_CLUSTER_COLOR[1] + jitter * 0.3),
    HII_CLUSTER_COLOR[2],
  ];
}

/**
 * Anisotropic inverse covariance for one YOUNG STARS splat (task #20):
 * `sigma` stretches by `sqrt(elongation)` along `axes.along` and squeezes by
 * the same factor along `axes.across` — area-preserving in that plane, the
 * same convention `buildDigVeil`'s (now-removed-for-this-tier) child scatter
 * used — leaving `axes.pole` at its own independent `poleSigma`. Exported so
 * `hiiRegions.test.ts` can pin the "major axis follows `along`" property
 * directly, without re-deriving the whole SF-event catalog to find one
 * synthetic seed's own component.
 */
export function associationSplatCovariance(
  axes: { readonly along: Vec3; readonly across: Vec3; readonly pole: Vec3 },
  sigma: number,
  elongation: number,
  poleSigma: number,
): { readonly invCovDiagonal: Vec3; readonly invCovOffDiagonal: Vec3 } {
  return inverseCovarianceFromFrame(axes, {
    along: sigma * Math.sqrt(elongation),
    across: sigma / Math.sqrt(elongation),
    pole: poleSigma,
  });
}

function buildBlueAssociations(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
  clusterFluxSum: number,
  midAgeSeeds: readonly AssociationSeedFrame[],
  seed: number,
): readonly GalaxyFieldComponent[] {
  // Stale-stored-tuning guard, same discipline `buildDigVeil` uses for `dig`.
  const assn = tuning.hii.associations;
  if (!assn) return [];
  const brightness = Math.max(0, assn.brightness);
  if (brightness <= 0 || midAgeSeeds.length === 0) return [];

  // Stellar continuum like the embedded cluster core, not Hα like the
  // shell/DIG — anchored to that SAME currency (`clusterFluxSum`, not
  // `totalFlux`), the same reasoning `buildDigVeil` uses for `shellFluxSum`.
  const assnTotalFlux = brightness * clusterFluxSum;
  if (!(assnTotalFlux > 0)) return [];

  // One splat per seed now (task #20) — `deriveComplexCount`'s shared
  // scaler/clamp still applies, `childrenPerComplex` pinned to 1 since
  // there is no children tier left to multiply the population against.
  const count = deriveComplexCount(
    midAgeSeeds.length * ASSN_COMPLEXES_PER_EVENT,
    assn.complexes,
    1,
    ASSOCIATIONS_MAX_COUNT,
  );
  if (count <= 0) return [];
  const seeds = selectAssociationSeeds(midAgeSeeds, count);

  const elongation = assn.elongation;
  if (!(elongation > 0)) return [];
  const coherence = Math.min(1, Math.max(0, assn.coherence));
  const poleSigma = pcToUnits(ASSN_SCALE_HEIGHT_PC);

  const rng = mulberry32(seed ^ ASSN_SALT);
  const amplitudeBase = assnTotalFlux / seeds.length;
  // `?? 1`: stale-stored-tuning guard, same discipline every other `hii.*`
  // knob added after launch carries. `amplitudeBase` above is independent of
  // sigma, and the amplitude pushed below divides it by the ACTUAL
  // (sizeScale-adjusted) sigma volume — so a splat's own INTEGRATED flux
  // never moves with this knob, only its footprint does (board 21: coverage
  // is count x area, and area goes as sizeScale squared).
  const sizeScale = assn.sizeScale ?? 1;
  // Stale-stored-tuning guard, same discipline `buildDigVeil` uses for
  // `dig.texture`. NEGATED: splat.wesl's fs reads the SIGN of a component's
  // own textureWeight to pick which noise volume to sample (io.wesl's comps
  // doc) — negative selects starGrainTex (this tier's own "thousands of
  // stars" grain), positive/zero stays on shell/DIG's shared ridged fbm.
  const assnTextureWeight = -(assn.texture ?? 0);

  const out: GalaxyFieldComponent[] = [];
  for (const seedFrame of seeds) {
    const axes = scatterAxesForCoherence(seedFrame, coherence, rng);
    const sigma = pcToUnits(
      (ASSN_SIGMA_MIN_PC + (ASSN_SIGMA_MAX_PC - ASSN_SIGMA_MIN_PC) * rng()) * sizeScale,
    );
    const sigmaAlong = sigma * Math.sqrt(elongation);
    const sigmaAcross = sigma / Math.sqrt(elongation);

    // No per-child jitter left to offset the centre with — the splat's own
    // (x, z) IS the seed's already-drifted position, its own covariance
    // (not a scatter of samples) is what now carries the association's
    // extent. Warp lift at THIS splat's own (x, z), same discipline
    // `buildDigVeil`'s per-child re-lift uses.
    const x = seedFrame.point[0];
    const z = seedFrame.point[2];
    const y = seedFrame.point[1] + warpHeight(Math.hypot(x, z), Math.atan2(z, x), geometry);

    out.push({
      amplitude: amplitudeBase / (TAU_ROOT3 * sigmaAlong * sigmaAcross * poleSigma),
      ...associationSplatCovariance(
        { along: axes.along, across: axes.across, pole: seedFrame.pole },
        sigma,
        elongation,
        poleSigma,
      ),
      color: associationSplatColor(rng),
      center: [x, y, z],
      boundRadius: Math.max(sigmaAlong, sigmaAcross, poleSigma),
      textureWeight: assnTextureWeight,
    });
  }
  return out;
}

export function buildHiiRegions(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
  starFormation: GalaxyStarFormationParams,
  seed: number,
  ismMap: GalaxyIsmMap | null,
): readonly GalaxyFieldComponent[] {
  // `radiusScale ?? 1`: board 19 moved it onto `hii.shells` — see
  // `candidateRegionsFromCatalog`'s own comment for why a hole defaults to
  // the law exactly rather than gating the whole tier off.
  if (
    !tuning.hii.enabled ||
    tuning.hii.brightness <= 0 ||
    (tuning.hii.shells.radiusScale ?? 1) <= 0
  ) {
    return [];
  }
  // `numArms`/`sfActivity` only gate the arm-ridge catalog path — the fluid
  // event window has neither dependency (a fluid run can legitimately place
  // events off the arm-forcing floor bias with zero arms, and its count
  // comes from `ismMapFluid.eventRate`, never `starFormation.sfActivity`).
  const isFluid = tuning.ismMap.generator === 'fluid';
  if (!isFluid && (geometry.numArms <= 0 || starFormation.sfActivity <= 0)) {
    return [];
  }

  const candidateRegions = planRegions(geometry, tuning, starFormation, seed);
  if (candidateRegions.length === 0) return [];
  // Fluid-sourced regions skip the map-seeding post-pass entirely — see
  // `applyIsmMapSeeding`'s own header for why re-jittering them would be a
  // regression, not a refinement.
  const regions = isFluid
    ? candidateRegions
    : applyIsmMapSeeding(candidateRegions, geometry, tuning, ismMap, seed);

  let luminositySum = 0;
  for (const region of regions) luminositySum += region.luminosity;
  if (!(luminositySum > 0)) return [];

  const totalFlux = tierFlux(geometry, tuning);
  if (!(totalFlux > 0)) return [];

  // The shell IS the ionized gas, so it takes the palette's CORE lane —
  // metallicity sets the [OIII]/Ha balance that decides teal vs crimson, and
  // `hiiPalette` is the one place that law lives. No conversion: `gen.hiiCore`
  // and `GalaxyFieldComponent.color` are both linear RGB in 0..1. The halo lane
  // has no counterpart here — this tier resolves the shell instead of glowing it.
  const shellColor = geometry.hiiPalette.core;

  const rng = mulberry32(seed ^ 0x48494920); // "HII "
  const clusterShare =
    Math.min(1, Math.max(0, tuning.hii.shells.clusterStrength ?? 0.6)) * CLUSTER_FLUX_SHARE_MAX;
  // Stale-stored-tuning guard, same discipline `ismMapSeeding` uses just
  // above: a preset saved before this knob existed carries no `texture` key.
  const shellTextureWeight = tuning.hii.shells.texture ?? 0;
  // This tier's own gain (board item 19) — applied ONLY to the amplitudes
  // pushed below, never to `shellFluxSum`/`clusterFluxSum` (see `tierFlux`'s
  // own doc), so it never leaks into DIG/associations' anchors.
  const shellsBrightness = tuning.hii.shells.brightness ?? 1;
  const out: GalaxyFieldComponent[] = [];

  // Accumulated in the SAME currency the shell/cluster amplitudes below are
  // drawn from (flux, pre-division-by-sprite-count) — the DIG veil's total
  // flux is anchored to `shellFluxSum` (Hα) and the blue-association tier's
  // to `clusterFluxSum` (stellar continuum), not to `totalFlux`.
  let shellFluxSum = 0;
  let clusterFluxSum = 0;

  for (const region of regions) {
    const regionFlux = (totalFlux * region.luminosity) / luminositySum;
    const clusterFlux = region.clusterCount > 0 ? regionFlux * clusterShare : 0;
    const shellFlux = regionFlux - clusterFlux;
    shellFluxSum += shellFlux;
    clusterFluxSum += clusterFlux;

    if (region.shellCount > 0 && shellFlux > 0 && shellsBrightness > 0) {
      const sigma = region.radius * SHELL_SPRITE_SIGMA_RATIO;
      const amplitude =
        (shellFlux * shellsBrightness) / region.shellCount / (TAU_ROOT3 * sigma * sigma * sigma);
      // `?? 0.25`: same board-19 hole as `radiusScale` above.
      const thickness = Math.max(0, tuning.hii.shells.shellThickness ?? 0.25);
      for (let i = 0; i < region.shellCount; i++) {
        const dir = randomDirection(rng);
        const r = region.radius * Math.max(0, 1 + thickness * (rng() * 2 - 1));
        out.push({
          amplitude,
          ...inverseCovarianceFromFrame(ISO_FRAME, { along: sigma, across: sigma, pole: sigma }),
          color: shellColor,
          center: [
            region.center[0] + dir[0] * r,
            region.center[1] + dir[1] * r,
            region.center[2] + dir[2] * r,
          ],
          boundRadius: sigma,
          textureWeight: shellTextureWeight,
        });
      }
    }

    if (region.clusterCount > 0 && clusterFlux > 0 && shellsBrightness > 0) {
      const sigma = region.radius * CLUSTER_SPRITE_SIGMA_RATIO;
      const amplitude =
        (clusterFlux * shellsBrightness) /
        region.clusterCount /
        (TAU_ROOT3 * sigma * sigma * sigma);
      for (let i = 0; i < region.clusterCount; i++) {
        const dir = randomDirection(rng);
        const r = region.radius * CLUSTER_SPREAD_RATIO * rng();
        out.push({
          amplitude,
          ...inverseCovarianceFromFrame(ISO_FRAME, { along: sigma, across: sigma, pole: sigma }),
          color: HII_CLUSTER_COLOR,
          center: [
            region.center[0] + dir[0] * r,
            region.center[1] + dir[1] * r,
            region.center[2] + dir[2] * r,
          ],
          boundRadius: sigma,
          textureWeight: shellTextureWeight,
        });
      }
    }
  }

  // Lifecycle population behind BOTH tiers below (task #10) — one pass over
  // the SAME SF-event catalog `planRegions` drew its young regions from, see
  // `resolveEventLifecyclePopulation`'s own header for why recomputing it
  // here (rather than threading `planRegions`' own catalog through) is sound.
  const lifecycle = resolveEventLifecyclePopulation(geometry, tuning, starFormation, seed);
  const recentEventCount = lifecycle.youngCount + lifecycle.midAgeSeeds.length;

  // DIG veil — placed independently of the catalog regions above (its own
  // complex/children structure, own rng stream), so `dig` never perturbs
  // which regions were admitted or where they sit. See `buildDigVeil`'s own
  // header for the gating and flux-anchoring discipline.
  for (const component of buildDigVeil(
    geometry,
    tuning,
    ismMap,
    shellFluxSum,
    recentEventCount,
    seed,
  )) {
    out.push(component);
  }

  // Blue OB-association tier — placed independently of both the catalog
  // regions and the DIG veil (its own complex/children structure, own rng
  // stream). See `buildBlueAssociations`'s own header for the gating and
  // flux-anchoring discipline.
  for (const component of buildBlueAssociations(
    geometry,
    tuning,
    clusterFluxSum,
    lifecycle.midAgeSeeds,
    seed,
  )) {
    out.push(component);
  }

  return out;
}

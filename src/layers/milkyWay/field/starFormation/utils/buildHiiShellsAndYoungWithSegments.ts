/**
 * The young end of the SF-event catalog (`age01 <= HII_AGE_GATE`) as
 * glowing shells: isotropic Gaussian sprites on each event's Stromgren
 * sphere, plus an optional embedded OB cluster. Limb brightening falls out
 * of line-of-sight column density through a radially-jittered shell, not a
 * rim term. Drawn into its own target (`hiiTex`), never folded into
 * `galaxyFieldMixture.ts`'s output: a shell sprite is small and bright by
 * construction, and sharing the smooth field's downsampled target
 * collapses it into a bloom firefly.
 */
import { hiiLuminosityOf } from './hiiLuminosityOf';
import { armRidgeAngle } from '../../arms/utils/armRidgeAngle';
import { ISM_MAP_RINGS } from '../../ismMap/data/ismMapRings';
import type { GalaxyIsmMapGridRadius } from '../../ismMap/@types/GalaxyIsmMapGridRadius';
import { buildGalaxyIsmMapFluidEvents } from '../../ismMap/utils/buildGalaxyIsmMapFluidEvents';
import { buildSfEventCatalog } from './sfEventCatalog';
import { fluidMidAgeEventWindow } from './fluidMidAgeEventWindow';
import { buildYoungStarChain } from './youngStarChain';
import { inverseCovarianceFromFrame } from '../../mixture/utils/inverseCovarianceFromFrame';
import { ismMapRingRadius } from '../../../../../utils/galaxy/ismMapRingRadius';
import { warpHeight } from '../../mixture/utils/warpHeight';
import { warpSurfaceFrame } from '../../mixture/utils/warpSurfaceFrame';
import { gaussian } from '../../../../../utils/random/gaussian';
import { mulberry32 } from '../../../../../utils/random/mulberry32';
import type { GalaxyFieldComponent } from '../../mixture/@types/GalaxyFieldComponent';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../mixture/@types/GalaxyFieldTuning';
import type { GalaxyStarFormationParams } from '../@types/GalaxyStarFormationParams';
import type { SfEvent } from '../@types/SfEvent';
import type { IsmMapFluidEvent } from '../../ismMap/@types/IsmMapFluidEvent';
import type { Vec3 } from '../../../../../@types/math/Vec3';
import { armRidgeCurvePoint } from '../../arms/utils/armRidgeCurvePoint';
import { ismMapFluidEventWindow } from '../../ismMap/utils/ismMapFluidEventWindow';
import { ismMapGridRadius } from '../../ismMap/utils/ismMapGridRadius';
import { ISM_MAP_AZ } from '../../ismMap/data/ismMapAz';
import type { HiiSegment } from '../@types/HiiSegment';
import { hiiRadiusUnits } from './hiiRadiusUnits';
import { HII_AGE_GATE } from '../data/hiiAgeGate';
import { HII_CLUSTER_COLOR } from '../data/hiiClusterColor';
import { RECENT_EVENT_AGE_FRAC_CEIL } from '../data/recentEventAgeFracCeil';
import { HiiShellsAndYoungResult } from '../@types/HiiShellsAndYoungResult';
import { RegionPlan } from '../@types/RegionPlan';
import { TAU_ROOT3 } from '../data/tauRoot3';
import { ISO_FRAME } from '../data/isoFrame';
import { HII_MAX_COUNT } from '../data/hiiMaxCount';
import { EMPTY_SHELLS_AND_YOUNG } from '../data/emptyShellsAndYoung';

/** Shell sprite count spans this range across the luminosity draw's four decades (`hiiLuminosityOf.ts`'s `LUMINOSITY_MAX = 1e4`) — Orion-class costs ~3, a 30-Doradus-class giant ~40. */
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
 * `shellFluxSum`, the anchor `buildDigVeil` scales its OWN gain against, so
 * this must stay free of `shells.brightness` or that gain would leak into
 * DIG too. `shells.brightness` is applied only to the amplitudes pushed
 * below.
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

/** World centre of one SF event, resolved on the warp surface — identical technique to `buildDustBubblePlacements.ts`, not re-derived. */
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
 * grid coordinate — the SAME radius/angle -> world x/z convention
 * `placeDigMapComplex` below uses for its CDF-sampled placements
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
 * Recent-event count behind the DIG veil's own complex population: young
 * events (same gate `planRegions` admits into HII shells) plus mid-age ones
 * whose age sits in `(youngGate, RECENT_EVENT_AGE_FRAC_CEIL]` — recomputed
 * here rather than threaded, the same "recompute over thread" call
 * `candidateRegionsFromFluidEvents`'s own header already makes. See
 * `fluidMidAgeEventWindow.ts`'s `fluidMidAgeEventWindow` for the window itself,
 * DIG's only consumer.
 */
function resolveEventLifecyclePopulation(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
  starFormation: GalaxyStarFormationParams,
  seed: number,
): number {
  if (tuning.ismMap.generator === 'fluid') {
    const fluid = tuning.ismMapFluid;
    const events = buildGalaxyIsmMapFluidEvents(geometry, tuning, seed);
    const young = ismMapFluidEventWindow(events, fluid.steps, fluid.impulseDuration);
    const midAge = fluidMidAgeEventWindow(events, fluid.steps, fluid.impulseDuration);
    return young.end - young.start + (midAge.end - midAge.start);
  }

  // young (age01 <= HII_AGE_GATE) plus mid-age (up to RECENT_EVENT_AGE_FRAC_CEIL,
  // strictly past HII_AGE_GATE) collapses to one bound: the ceiling.
  const events = buildSfEventCatalog(geometry, starFormation, tuning, seed);
  let count = 0;
  for (const event of events) {
    if (event.age01 <= RECENT_EVENT_AGE_FRAC_CEIL) count++;
  }
  return count;
}

/**
 * buildHiiShellsAndYoungWithSegments — the shell/cluster and young-stars
 * tiers' full computation (`buildHiiRegionsWithSegments`'s own body, MINUS
 * the DIG veil loop) — extracted so `createGalaxyModel.ts`'s central-galaxy
 * path can run it WITHOUT also running `buildDigVeil`'s CPU placement loop:
 * DIG moved GPU-side (Task 8, `placeDigVeil.wesl` + `computeDigVeilBudget.ts`),
 * shells/young did not (the coordinator's own "minimal restructure" ruling —
 * see that task's report). `buildHiiRegionsWithSegments` below is a THIN
 * wrapper over this function that re-inserts DIG's own components/segment,
 * so every EXISTING caller (extras, this file's own test suite) sees
 * byte-identical behaviour to before this split.
 */
export function buildHiiShellsAndYoungWithSegments(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
  starFormation: GalaxyStarFormationParams,
  seed: number,
): HiiShellsAndYoungResult {
  // `radiusScale ?? 1`: board 19 moved it onto `hii.shells` — see
  // `candidateRegionsFromCatalog`'s own comment for why a hole defaults to
  // the law exactly rather than gating the whole tier off.
  if (
    !tuning.hii.enabled ||
    tuning.hii.brightness <= 0 ||
    (tuning.hii.shells.radiusScale ?? 1) <= 0
  ) {
    return EMPTY_SHELLS_AND_YOUNG;
  }
  // `numArms`/`sfActivity` only gate the arm-ridge catalog path — the fluid
  // event window has neither dependency (a fluid run can legitimately place
  // events off the arm-forcing floor bias with zero arms, and its count
  // comes from `ismMapFluid.eventRate`, never `starFormation.sfActivity`).
  const isFluid = tuning.ismMap.generator === 'fluid';
  if (!isFluid && (geometry.numArms <= 0 || starFormation.sfActivity <= 0)) {
    return EMPTY_SHELLS_AND_YOUNG;
  }

  const candidateRegions = planRegions(geometry, tuning, starFormation, seed);
  if (candidateRegions.length === 0) return EMPTY_SHELLS_AND_YOUNG;

  let luminositySum = 0;
  for (const region of candidateRegions) luminositySum += region.luminosity;
  if (!(luminositySum > 0)) return EMPTY_SHELLS_AND_YOUNG;

  const totalFlux = tierFlux(geometry, tuning);
  if (!(totalFlux > 0)) return EMPTY_SHELLS_AND_YOUNG;

  // The shell IS the ionized gas, so it takes the palette's CORE lane —
  // metallicity sets the [OIII]/Ha balance that decides teal vs crimson, and
  // `hiiPalette` is the one place that law lives. No conversion: `gen.hiiCore`
  // and `GalaxyFieldComponent.color` are both linear RGB in 0..1. The halo lane
  // has no counterpart here — this tier resolves the shell instead of glowing it.
  const shellColor = geometry.hiiPalette.core;

  const rng = mulberry32(seed ^ 0x48494920); // "HII "
  const clusterShare =
    Math.min(1, Math.max(0, tuning.hii.shells.clusterStrength ?? 0.6)) * CLUSTER_FLUX_SHARE_MAX;
  // Stale-stored-tuning guard, same discipline `radiusScale ?? 1` uses just
  // above: a preset saved before this knob existed carries no `texture` key.
  const shellTextureWeight = tuning.hii.shells.texture ?? 0;
  // This tier's own gain (board item 19) — applied ONLY to the amplitudes
  // pushed below, never to `shellFluxSum` (see `tierFlux`'s own doc), so it
  // never leaks into DIG's anchor.
  const shellsBrightness = tuning.hii.shells.brightness ?? 1;
  // `?? true`: same stale-stored-tuning guard as `radiusScale`/`shellThickness`
  // above — gates ONLY the sprite-emission loops below, never `shellFluxSum`'s
  // accumulation (unconditional, just below), so DIG's flux anchor and
  // `recentEventCount` (a separate catalog pass, see
  // `resolveEventLifecyclePopulation`) are untouched by this toggle. Building
  // zero components is the point (project rule: opacity 0 must still skip
  // BUILDING, not just zero the flux) — a disabled tier still needs its flux
  // split computed so the tiers that anchor off it don't see a discontinuity.
  const shellsEnabled = tuning.hii.shells.enabled ?? true;
  const out: GalaxyFieldComponent[] = [];

  // Accumulated in the SAME currency the shell/cluster amplitudes below are
  // drawn from (flux, pre-division-by-sprite-count) — the DIG veil's total
  // flux is anchored to this (Hα), not to `totalFlux`.
  let shellFluxSum = 0;

  for (const region of candidateRegions) {
    const regionFlux = (totalFlux * region.luminosity) / luminositySum;
    const clusterFlux = region.clusterCount > 0 ? regionFlux * clusterShare : 0;
    const shellFlux = regionFlux - clusterFlux;
    shellFluxSum += shellFlux;

    if (shellsEnabled && region.shellCount > 0 && shellFlux > 0 && shellsBrightness > 0) {
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

    if (shellsEnabled && region.clusterCount > 0 && clusterFlux > 0 && shellsBrightness > 0) {
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
  // Checkpoint, not a formula: the shell/cluster tier ends exactly here,
  // whatever `candidateRegions`' admission produced.
  const shellsEnd = out.length;

  // Recent-event population behind DIG's own complex count (task #10) — one
  // pass over the SAME SF-event catalog `planRegions` drew its young regions
  // from, see `resolveEventLifecyclePopulation`'s own header for why
  // recomputing it here (rather than threading `planRegions`' own catalog
  // through) is sound. Exposed on this function's own return (not just
  // consumed locally) — Task 8's `computeDigVeilBudget.ts` is now the ONLY
  // consumer of this value for the central galaxy's own DIG reservation.
  const recentEventCount = resolveEventLifecyclePopulation(geometry, tuning, starFormation, seed);

  // Young-stars chain — placed off the arm ridge itself (starFormation/utils/youngStarChain.ts),
  // not off the catalog regions above or DIG's own map CDF (which no longer
  // runs in THIS function at all — see `buildHiiRegionsWithSegments` below
  // for where it's re-inserted for the CPU-parity/extras callers). See
  // `buildYoungStarChain`'s own header for the gating discipline.
  for (const component of buildYoungStarChain(geometry, tuning, seed)) {
    out.push(component);
  }

  const segments: readonly HiiSegment[] = [
    { label: 'hii:shells', first: 0, count: shellsEnd },
    { label: 'hii:young', first: shellsEnd, count: out.length - shellsEnd },
  ];
  return { components: out, segments, shellFluxSum, recentEventCount };
}

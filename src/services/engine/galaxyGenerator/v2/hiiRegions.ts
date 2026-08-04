/**
 * buildHiiRegions — the young end of the SF-event catalog (`age01 <=
 * HII_AGE_GATE`) as glowing shells: isotropic Gaussian sprites scattered on
 * each event's Stromgren sphere, plus an optional embedded OB cluster. Limb
 * brightening is NOT a rim term — it falls out of line-of-sight column
 * density through a radially-jittered shell, the way a real thin shell does.
 *
 * Flux is ADDITIVE and split across regions by their own `hiiLuminosityOf`
 * draw. PURITY INVARIANT: pure `(geometry, tuning, starFormation, seed) ->
 * flat data`, same discipline as `sfEventCatalog.ts`. Drawn by `createGalaxyEngine.ts`
 * into its OWN target (`hiiTex`), never folded into
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
import { armRidgeAngle, armRidgeCurvePoint } from './armRidgeGeometry';
import { buildSfEventCatalog } from './sfEventCatalog';
import { inverseCovarianceFromFrame } from '../../../../utils/galaxy/inverseCovarianceFromFrame';
import { warpSurfaceFrame } from '../../../../utils/galaxy/warpSurfaceFrame';
import { gaussian } from '../../../../utils/random/gaussian';
import { mulberry32 } from '../../../../utils/random/mulberry32';
import type { GalaxyFieldComponent } from '../../../../@types/galaxy/GalaxyFieldComponent';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../@types/galaxy/GalaxyFieldTuning';
import type { GalaxyStarFormationParams } from '../../../../@types/galaxy/GalaxyStarFormationParams';
import type { SfEvent } from '../../../../@types/galaxy/SfEvent';
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

/** Cluster's ceiling share of a region's own flux at `hiiClusterStrength` 1 — a bright core, not a rival to the shell. */
const CLUSTER_FLUX_SHARE_MAX = 0.2;

const TAU_ROOT3 = (2 * Math.PI) ** 1.5;

/** Isotropic sprites don't need an oriented frame — any orthonormal basis gives the same M when all three sigmas match. */
const ISO_FRAME = { along: [1, 0, 0] as Vec3, across: [0, 1, 0] as Vec3, pole: [0, 0, 1] as Vec3 };

/**
 * Base per-star emission this tier's `hiiBrightness` multiplies, in the same
 * star-count x size^2 currency `galaxyFieldMixture.ts`'s (private, unexported)
 * `emissionScale` uses for every other tier — reusing that anchor keeps this
 * ADDITIVE tier the same order of magnitude as the disc it sits on top of,
 * without needing the exact function (this tier owes the disc no debit, so
 * only a comparable scale matters, not an identical one). 0.01 lands the
 * Milky Way preset's HII-to-disc flux ratio around 1:10 at `hiiBrightness`
 * 1 — a starting point for visual calibration, not a measurement.
 */
const HII_FLUX_PER_STAR_AREA = 0.01;

function tierFlux(geometry: GalaxyDescription, tuning: GalaxyFieldTuning): number {
  return (
    geometry.modelledStars *
    geometry.starSize *
    geometry.starSize *
    HII_FLUX_PER_STAR_AREA *
    Math.max(0, tuning.hiiBrightness)
  );
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

function planRegions(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
  starFormation: GalaxyStarFormationParams,
  seed: number,
): readonly RegionPlan[] {
  const events = buildSfEventCatalog(geometry, starFormation, tuning, seed);
  const clusterOn = tuning.hiiClusterStrength > 0;

  const all: RegionPlan[] = [];
  for (const event of events) {
    if (event.age01 > HII_AGE_GATE) continue;
    const luminosity = hiiLuminosityOf(event);
    const radius = hiiRadiusUnits(luminosity, tuning.hiiRadiusScale);
    if (radius <= 0) continue;
    const center = eventCenter(event, geometry);
    if (!center) continue;
    all.push({
      center,
      radius,
      luminosity,
      shellCount: shellSpriteCount(luminosity),
      clusterCount: clusterOn ? CLUSTER_SPRITE_COUNT : 0,
    });
  }

  // Drop the FAINTEST regions first when over budget: sorted brightest-first,
  // each candidate is admitted if it still fits — cheap and unbiased because
  // the L^-2 draw means the tail being dropped carries almost none of the
  // tier's total flux.
  all.sort((a, b) => b.luminosity - a.luminosity);
  const kept: RegionPlan[] = [];
  let used = 0;
  for (const region of all) {
    const cost = region.shellCount + region.clusterCount;
    if (used + cost > HII_MAX_COUNT) continue;
    kept.push(region);
    used += cost;
  }
  return kept;
}

export function buildHiiRegions(
  geometry: GalaxyDescription,
  tuning: GalaxyFieldTuning,
  starFormation: GalaxyStarFormationParams,
  seed: number,
): readonly GalaxyFieldComponent[] {
  if (
    !tuning.hiiEnabled ||
    tuning.hiiBrightness <= 0 ||
    tuning.hiiRadiusScale <= 0 ||
    geometry.numArms <= 0 ||
    starFormation.sfActivity <= 0
  ) {
    return [];
  }

  const regions = planRegions(geometry, tuning, starFormation, seed);
  if (regions.length === 0) return [];

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
  const clusterShare = Math.min(1, Math.max(0, tuning.hiiClusterStrength)) * CLUSTER_FLUX_SHARE_MAX;
  const out: GalaxyFieldComponent[] = [];

  for (const region of regions) {
    const regionFlux = (totalFlux * region.luminosity) / luminositySum;
    const clusterFlux = region.clusterCount > 0 ? regionFlux * clusterShare : 0;
    const shellFlux = regionFlux - clusterFlux;

    if (region.shellCount > 0 && shellFlux > 0) {
      const sigma = region.radius * SHELL_SPRITE_SIGMA_RATIO;
      const amplitude = shellFlux / region.shellCount / (TAU_ROOT3 * sigma * sigma * sigma);
      const thickness = Math.max(0, tuning.hiiShellThickness);
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
        });
      }
    }

    if (region.clusterCount > 0 && clusterFlux > 0) {
      const sigma = region.radius * CLUSTER_SPRITE_SIGMA_RATIO;
      const amplitude = clusterFlux / region.clusterCount / (TAU_ROOT3 * sigma * sigma * sigma);
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
        });
      }
    }
  }

  return out;
}

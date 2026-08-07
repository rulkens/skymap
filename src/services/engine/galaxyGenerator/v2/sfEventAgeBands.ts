/**
 * sfEventAgeBands — the lifecycle math shared by `hiiRegions.ts`'s DIG veil
 * and blue-association tiers: a normalized age boundary past which an SF
 * event stops counting as "recent" (task #10, docs/research/m74-jwst/), the
 * differential-rotation drift that carries a mid-age event's association
 * downstream of the gas lane it was born in, and the generic
 * population-scaler -> complex-count clamp both tiers now share. Pure
 * `(numbers, geometry) -> numbers/frames`, same discipline as
 * `hiiRegionGeometry.ts`.
 */
import { warpSurfaceFrame } from '../../../../utils/galaxy/warpSurfaceFrame';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { IsmMapFluidEvent } from '../../../../@types/galaxy/IsmMapFluidEvent';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { ismMapFluidEventWindow } from './galaxyIsmMapFluidEvents';
import type { IsmMapFluidEventWindow } from './galaxyIsmMapFluidEvents';

/**
 * Fraction ceiling — age01 for catalog events, `(steps - birthStep) / steps`
 * for fluid ones — past which an event ages out of "recent" for BOTH the DIG
 * population count and the association mid-age band's outer edge. Roughly
 * double `HII_AGE_GATE`: an OB association stays exposed several times
 * longer than the HII phase itself that preceded it — an eyeballed multiple,
 * not a measurement.
 */
export const RECENT_EVENT_AGE_FRAC_CEIL = 0.75;

/**
 * Catalog-mode (`sfEventCatalog.ts`) events carry no per-step clock of their
 * own (`age01` is a unitless 0..1 draw) — these three fixed references
 * convert it into the shear-drift formula's expected units WITHOUT reading
 * `tuning.ismMapFluid` live: `hiiRegionsFluidSeeding.test.ts` pins
 * 'automaton'/'none' as fluid-tuning-deaf (neither may react to a dragged
 * `ismMapFluid` slider), so borrowing the live fluid params here would
 * silently break that invariant. Values match the shipped fluid preset's own
 * `steps`/`corotationRadius`/`shearStrength`
 * (`defaultGalaxyIsmMapFluidParams.ts`) in magnitude only, not by reference.
 */
export const CATALOG_DRIFT_STEPS = 144;
export const CATALOG_SHEAR_COROTATION_RADIUS = 8.9;
export const CATALOG_SHEAR_STRENGTH = 0.015;

/**
 * Angular drift rate at `radius`, radians/step — the SAME `(1/r -
 * 1/corotationRadius) * shearRate` differential-rotation formula
 * `ismMapShear.wesl`'s `ismMapShearTexels` composes, kept in radians here
 * (pre-texel-conversion) since `radius` is already in the generator's own
 * world units. Positive inside corotation (for `shearStrength > 0`), meaning
 * matter drifts toward INCREASING angle — the `along` direction
 * `warpSurfaceFrame` returns — as it ages, the same sign
 * `ismMapFluidVelocity.wesl`'s `composedVelocity` advects gas with.
 */
export function shearOmega(
  radius: number,
  corotationRadius: number,
  shearStrength: number,
): number {
  return (1 / Math.max(radius, 1e-4) - 1 / Math.max(corotationRadius, 1e-4)) * shearStrength;
}

/**
 * `[start, end)` slice of a birthStep-sorted fluid event list (contract:
 * `IsmMapFluidEvent[]`'s own — see `buildGalaxyIsmMapFluidEvents`) whose age
 * sits strictly between the HII tier's own `impulseDuration` window and
 * `RECENT_EVENT_AGE_FRAC_CEIL`'s fraction of the run — the mid-age
 * (association) band. Both bounds share `ismMapFluidEventWindow`'s own
 * `.end` (both windows are computed at the SAME `step = steps`, and
 * `firstIndexWithBirthStepAbove` returns the identical index regardless of
 * `duration` there — see that function's own doc), so the band collapses to
 * a single slice diff rather than two independent binary searches.
 */
export function fluidMidAgeEventWindow(
  events: readonly IsmMapFluidEvent[],
  steps: number,
  impulseDuration: number,
): IsmMapFluidEventWindow {
  const young = ismMapFluidEventWindow(events, steps, impulseDuration);
  const outer = ismMapFluidEventWindow(events, steps, steps * RECENT_EVENT_AGE_FRAC_CEIL);
  return { start: outer.start, end: young.start };
}

/** Same shape as `hiiRegions.ts`'s own (private) `DigSeedFrame` — a flat-height seed point plus the local flow frame `scatterAxesForCoherence` blends its children's scatter axes against. */
export type AssociationSeedFrame = {
  readonly point: Vec3;
  readonly along: Vec3;
  readonly across: Vec3;
  readonly pole: Vec3;
};

/**
 * One mid-age event's association seed: its gas-lane birth position
 * (`center`, at its own ridge `radius`/`angle`) carried forward by
 * `ageSteps` of differential rotation — B/A stars keep shining long after
 * the HII phase that formed them, long enough to visibly lag the gas lane
 * (docs/research/m74-jwst/). `driftStrength` is `associations.armBias`
 * repurposed as a multiplier on the computed drift (see `hiiRegions.ts`'s
 * `buildBlueAssociations` header for why the CDF blend it used to weight no
 * longer exists to blend against). Small-angle approximation — arclength ~=
 * radius * dPhi — the same one `eventCenter`'s own acrossOffset placement
 * already relies on.
 */
export function driftedAssociationSeed(
  center: Vec3,
  radius: number,
  angle: number,
  ageSteps: number,
  driftStrength: number,
  corotationRadius: number,
  shearStrength: number,
  geometry: GalaxyDescription,
): AssociationSeedFrame {
  const along = warpSurfaceFrame(radius, angle, geometry).along;
  const drift =
    radius * shearOmega(radius, corotationRadius, shearStrength) * ageSteps * driftStrength;
  const point: Vec3 = [center[0] + along[0] * drift, 0, center[2] + along[2] * drift];
  // Local frame is re-resolved at the DRIFTED point's own (radius, angle),
  // not carried over from the birth ridge — same discipline `warpHeight`'s
  // own per-child re-lift uses in `buildDigVeil`/`buildBlueAssociations`:
  // the drift is large enough, relative to a single complex's own child
  // scatter, that reusing the birth frame would tilt the children's scatter
  // axes off the surface they actually sit on.
  const driftedRadius = Math.hypot(point[0], point[2]);
  const driftedAngle = Math.atan2(point[2], point[0]);
  const driftedFrame = warpSurfaceFrame(driftedRadius, driftedAngle, geometry);
  return { point, along: driftedFrame.along, across: driftedFrame.across, pole: driftedFrame.pole };
}

/**
 * Desired complex count from an event-derived `population` proxy (NOT
 * necessarily a raw event count — see each tier's own per-event density
 * constant in `hiiRegions.ts`), scaled by the tier's own slider (now a
 * scaler, not an absolute count) and clamped to `maxCount / childrenPerComplex`
 * — the same admission ceiling `buildDigVeil`/`buildBlueAssociations` already
 * applied to a literal count, kept visible here as the one clamp both tiers
 * share.
 */
export function deriveComplexCount(
  population: number,
  scaler: number,
  childrenPerComplex: number,
  maxCount: number,
): number {
  if (childrenPerComplex <= 0) return 0;
  const desired = Math.max(0, Math.round(population * scaler));
  return Math.min(desired, Math.floor(maxCount / childrenPerComplex));
}

/**
 * Subsamples (or, for a scaler that inflates past the run's own mid-age
 * population, oversamples) `seeds` down to `count` entries. A shrinking
 * count strides evenly across the array rather than taking a random draw or
 * a prefix, so a thinned population stays spatially representative instead
 * of biased toward wherever the event list happens to start; a growing count
 * cycles back through the same sites since there is no second population to
 * draw the extra complexes from.
 */
export function selectAssociationSeeds<T>(seeds: readonly T[], count: number): readonly T[] {
  if (seeds.length === 0 || count <= 0) return [];
  if (count >= seeds.length) {
    return Array.from({ length: count }, (_, i) => seeds[i % seeds.length]!);
  }
  const stride = seeds.length / count;
  return Array.from({ length: count }, (_, i) => seeds[Math.floor(i * stride)]!);
}

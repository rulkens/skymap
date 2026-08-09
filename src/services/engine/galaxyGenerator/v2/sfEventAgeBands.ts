/**
 * sfEventAgeBands — the lifecycle math `hiiRegions.ts`'s DIG veil shares: a
 * normalized age boundary past which an SF event stops counting as "recent"
 * (task #10, docs/research/m74-jwst/), the fluid mid-age event window DIG's
 * own complex count is derived from, and the population-scaler -> complex-
 * count clamp. Pure `(numbers) -> numbers`, same discipline as
 * `hiiRegionGeometry.ts`.
 */
import type { IsmMapFluidEvent } from '../../../../@types/galaxy/IsmMapFluidEvent';
import { ismMapFluidEventWindow } from './galaxyIsmMapFluidEvents';
import type { IsmMapFluidEventWindow } from './galaxyIsmMapFluidEvents';

/**
 * Fraction ceiling — age01 for catalog events, `(steps - birthStep) / steps`
 * for fluid ones — past which an event ages out of "recent" for the DIG
 * population count. Roughly double `HII_AGE_GATE`: the exposed phase this
 * bounded stays visible several times longer than the HII phase itself that
 * preceded it — an eyeballed multiple, not a measurement.
 */
export const RECENT_EVENT_AGE_FRAC_CEIL = 0.75;

/**
 * `[start, end)` slice of a birthStep-sorted fluid event list (contract:
 * `IsmMapFluidEvent[]`'s own — see `buildGalaxyIsmMapFluidEvents`) whose age
 * sits strictly between the HII tier's own `impulseDuration` window and
 * `RECENT_EVENT_AGE_FRAC_CEIL`'s fraction of the run — the mid-age band. Both
 * bounds share `ismMapFluidEventWindow`'s own `.end` (both windows are
 * computed at the SAME `step = steps`, and `firstIndexWithBirthStepAbove`
 * returns the identical index regardless of `duration` there — see that
 * function's own doc), so the band collapses to a single slice diff rather
 * than two independent binary searches.
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

/**
 * Desired complex count from an event-derived `population` proxy (NOT
 * necessarily a raw event count — see `hiiRegions.ts`'s own per-event
 * density constant), scaled by the tier's own slider (a scaler, not an
 * absolute count) and clamped to `maxCount / childrenPerComplex` — the same
 * admission ceiling `buildDigVeil` already applied to a literal count.
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

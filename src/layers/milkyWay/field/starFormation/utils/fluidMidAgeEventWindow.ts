/**
 * fluidMidAgeEventWindow — the lifecycle math the DIG veil shares with the
 * shells: the mid-age fluid-event window DIG's complex count is derived from
 * (task #10, docs/research/m74-jwst/), past `RECENT_EVENT_AGE_FRAC_CEIL`.
 * Pure `(numbers) -> numbers`, same discipline as `hiiLuminosityOf.ts`.
 */
import type { IsmMapFluidEvent } from '../../ismMap/@types/IsmMapFluidEvent';
import { ismMapFluidEventWindow } from '../../ismMap/utils/ismMapFluidEventWindow';
import type { IsmMapFluidEventWindow } from '../../ismMap/@types/IsmMapFluidEventWindow';
import { RECENT_EVENT_AGE_FRAC_CEIL } from '../data/recentEventAgeFracCeil';

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

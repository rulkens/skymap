import type { IsmMapFluidEvent } from '../@types/IsmMapFluidEvent';
import { IsmMapFluidEventWindow } from '../@types/IsmMapFluidEventWindow';

/**
 * `[start, end)` slice of a birthStep-sorted `events` list active at
 * generation `step`, mirroring `ismMapFluidStep.wesl`'s per-event
 * `age < 0.0 || age >= impulseDuration` skip but computed once CPU-side via
 * two binary searches. `events` must already be sorted ascending by
 * `birthStep`; this function does not sort, so an unsorted list produces a
 * silently wrong window, not a thrown error.
 */
export function ismMapFluidEventWindow(
  events: readonly IsmMapFluidEvent[],
  step: number,
  impulseDuration: number,
): IsmMapFluidEventWindow {
  return {
    start: firstIndexWithBirthStepAbove(events, step - impulseDuration),
    end: firstIndexWithBirthStepAbove(events, step),
  };
}

/** First index whose `birthStep` exceeds `threshold` — same upper-bound search idiom as this file's own `upperBound`, kept separate since it walks event objects by field, not a raw cumulative-weight array. */
function firstIndexWithBirthStepAbove(
  events: readonly IsmMapFluidEvent[],
  threshold: number,
): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid]!.birthStep > threshold) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

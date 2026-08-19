/**
 * ROW_FOCUSABLE — whether a resolved SelectionRow has a real focus target (a
 * world position `focusFraming` can frame a camera pose on). Exhaustive over
 * `SelectionRow['type']`, so a future non-focusable arm (like
 * `zoneOfAvoidance`, the band with no `x`/`y`/`z`) fails to compile here
 * until someone declares it — rather than silently falling through to
 * `focusFraming`'s throw. `watchFocusTweenSaga` is the ONE place this is
 * read; do not add a second filter elsewhere.
 */
import type { SelectionRow } from '../../../@types/engine/SelectionRow';

export const ROW_FOCUSABLE: Record<SelectionRow['type'], boolean> = {
  galaxyCatalog: true,
  structure: true,
  milkyWay: true,
  // The band is a line-of-sight effect, not a point — no focus target.
  zoneOfAvoidance: false,
  body: true,
  star: true,
};

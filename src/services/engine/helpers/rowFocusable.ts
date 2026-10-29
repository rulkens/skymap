/**
 * ROW_FOCUSABLE — whether a SelectionRow has a world position `focusFraming` can frame.
 * Exhaustive over `SelectionRow['type']`, so a new arm fails to compile until declared rather
 * than reaching `focusFraming`'s throw. `watchFocusTweenSaga` is the ONE place this is read.
 */
import type { SelectionRow } from '../../../@types/engine/SelectionRow';

export const ROW_FOCUSABLE: Record<SelectionRow['type'], boolean> = {
  galaxyCatalog: true,
  structure: true,
  milkyWay: true,
  zoneOfAvoidance: false,
  body: true,
  craft: true,
  earthScene: true,
  starCatalog: true,
  blackHole: true,
  satellite: true,
};

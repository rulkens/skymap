import type { GalaxyFieldComponent } from '../../mixture/@types/GalaxyFieldComponent';
import type { HiiSegment } from './HiiSegment';

/**
 * `buildHiiShellsAndYoungWithSegments`'s own return shape — `shellFluxSum`/
 * `recentEventCount` are DIG's own inputs (`computeDigVeilBudget.ts`'s GPU
 * budget math, Task 8), exposed here because they're already a byproduct of
 * this computation and DIG's flux anchor is the SHELL tier's flux, not a
 * standalone quantity (`buildDigVeil`'s own doc) — recomputing either from
 * scratch on a separate pass would risk drifting from what this pass
 * actually built.
 */
export type HiiShellsAndYoungResult = {
  readonly components: readonly GalaxyFieldComponent[];
  readonly segments: readonly HiiSegment[];
  readonly shellFluxSum: number;
  readonly recentEventCount: number;
};

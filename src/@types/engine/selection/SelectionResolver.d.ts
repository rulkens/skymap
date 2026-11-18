import type { PickResult } from '../../data/PickResult';
import type { FocusResolution } from './FocusResolution';
import type { SelectionRefBase } from './SelectionRefBase';
import type { SelectionRowBase } from './SelectionRowBase';

/**
 * The one resolver `composeSelectionRows` builds over every `SelectionKindRow`; the
 * saga context's `selection` and the pick path both read this same object.
 */
export type SelectionResolver = {
  resolvePick(pick: PickResult | null): SelectionRefBase | null;
  extractRow(ref: SelectionRefBase | null, simDays: number): SelectionRowBase | null;
  /** `absent` when no row claims the id. */
  resolveFocusId(focusId: string): FocusResolution;
  /** The kind whose row claims `focusId`, known before its data loads (the reveal reads it). */
  claimedKind(focusId: string): SelectionRefBase['type'] | null;
  focusIdOf(ref: SelectionRefBase): string | null;
};

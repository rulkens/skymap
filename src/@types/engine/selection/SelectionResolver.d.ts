import type { PickResult } from '../../data/PickResult';
import type { SelectionRefBase } from './SelectionRefBase';
import type { SelectionRowBase } from './SelectionRowBase';

/**
 * The one resolver `composeSelectionRows` builds over every `SelectionKindRow`; the
 * saga context's `selection` and the pick path both read this same object.
 */
export type SelectionResolver = {
  resolvePick(pick: PickResult | null): SelectionRefBase | null;
  extractRow(ref: SelectionRefBase | null, simDays: number): SelectionRowBase | null;
  resolveFocusId(focusId: string): SelectionRefBase | null;
  focusIdOf(ref: SelectionRefBase): string | null;
};

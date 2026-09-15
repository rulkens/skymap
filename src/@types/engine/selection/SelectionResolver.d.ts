import type { SelectionRef } from '../SelectionRef';
import type { SelectionRow } from '../SelectionRow';
import type { PickResult } from '../../data/PickResult';

/**
 * The one resolver `composeSelectionRows` builds over every `SelectionKindRow`; the
 * saga context's `selection` and the pick path both read this same object.
 */
export type SelectionResolver = {
  resolvePick(pick: PickResult | null): SelectionRef | null;
  extractRow(ref: SelectionRef | null, simDays: number): SelectionRow | null;
  resolveFocusId(focusId: string): SelectionRef | null;
  focusIdOf(ref: SelectionRef): string | null;
};

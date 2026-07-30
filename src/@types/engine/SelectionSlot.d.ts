import type { SelectionState } from '../store/SelectionState';
import type { SelectionRef } from './SelectionRef';

/**
 * SelectionSlot — the slot name shared by every selection surface: the
 * `setSelectionRow` payload, the reconciler's `reextract`, and the tier
 * re-anchor's SELECTION_WRITE_BY_SLOT table. Derived from SelectionState so the
 * three stay in lockstep — adding a slot is a one-line widening of
 * SelectionState that flows everywhere.
 *
 * It is the REF-valued keys, not a bare `keyof`: the slice also carries
 * `pending`, which is in-flight request ids rather than a resolved-ref slot, and
 * none of the three surfaces above can do anything with it. Selecting by value
 * type rather than excluding the name by hand keeps that automatic for the next
 * non-ref field.
 */
export type SelectionSlot = {
  [K in keyof SelectionState]: SelectionState[K] extends SelectionRef | null ? K : never;
}[keyof SelectionState];

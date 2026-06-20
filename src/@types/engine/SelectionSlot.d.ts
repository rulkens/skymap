import type { SelectionState } from '../store/SelectionState';

/**
 * SelectionSlot — the slot name shared by every selection surface: the
 * `setSelectionRow` payload, the reconciler's `reextract`, and the tier
 * re-anchor's SELECTION_WRITE_BY_SLOT table. Declared once as `keyof
 * SelectionState` so the three stay in lockstep — adding a slot is a one-line
 * widening of SelectionState that flows everywhere.
 */
export type SelectionSlot = keyof SelectionState;

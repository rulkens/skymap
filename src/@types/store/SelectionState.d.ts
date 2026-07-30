import type { SelectionRef } from '../engine/SelectionRef';

/**
 * SelectionState — the three identity-Intent slots. Hover precedes select
 * precedes focus; each holds a SelectionRef or null. This is the durable,
 * persistable/restorable Intent layer (sibling to the volatile SelectionRowsState).
 *
 * `pending` carries the IN-FLIGHT half of that Intent: the durable focus id a
 * `requestSelect` / `requestFocus` command asked for, held until the matching
 * resolved ref lands in its slot. A resolution can take arbitrarily long — the
 * request sagas defer on `catalogLoaded` — and until it completes the three ref
 * slots say nothing at all about what was asked for. Readers that must survive
 * that window (the URL writer, which would otherwise publish a hash with no
 * focus) consult `pending`; readers that need a resolved target keep reading
 * the ref slots. Keyed by slot rather than a single field so the two commands
 * stay independent, matching the one-command-one-slot split they already have.
 */
export type SelectionState = {
  readonly hover: SelectionRef | null;
  readonly select: SelectionRef | null;
  readonly focus: SelectionRef | null;
  readonly pending: { readonly select: string | null; readonly focus: string | null };
};

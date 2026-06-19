// src/@types/store/SelectionRowsState.d.ts
import type { SelectionSlot } from '../engine/SelectionSlot';
import type { SelectionRow } from '../engine/SelectionRow';

/**
 * SelectionRowsState — the saga-owned derived display cache. One `SelectionRow`
 * (or null when no selection occupies that slot) per `SelectionSlot`. This slice
 * is the READ surface for InfoCard and any other UI that needs the resolved,
 * JSON-serializable representation of a selected thing.
 *
 * Distinct from `SelectionState` (which holds raw `SelectionRef` identity
 * Intent) — the saga bridges the two: it watches `SelectionState` for changes,
 * resolves each live ref against the engine's in-memory catalogs, and writes the
 * result here via `setSelectionRow`. The saga is the ONLY writer; selectors are
 * the ONLY readers.
 *
 * The shape is a `Record` over `SelectionSlot` so that adding a fourth slot to
 * `SelectionState` automatically widens this type too — no parallel manual
 * update needed.
 */
export type SelectionRowsState = {
  readonly [K in SelectionSlot]: SelectionRow | null;
};

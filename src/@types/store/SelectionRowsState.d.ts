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
 *
 * `focusId` is the focus row's durable `#focus=` id, landed in the same action
 * as the row so the two can never disagree: the saga encodes it only when the row
 * resolved, so an unresolvable ref publishes no link. Null when nothing is focused
 * or the kind has no link form.
 */
export type SelectionRowsState = {
  readonly [K in SelectionSlot]: SelectionRow | null;
} & { readonly focusId: string | null };

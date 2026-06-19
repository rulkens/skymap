/**
 * makeRunFocusTween — the engine-side camera-tween runner the watchFocusTween
 * saga calls through SagaContext (symmetric with makeRunTierTransition). Given a
 * focus SelectionRef it re-resolves the row via the live `resolveDeps` (so it
 * never depends on the reconciler having run first), then dispatches by tag to
 * an injected `tweens` table. The table is injected — not closed over here — so
 * this stays pure and hermetic; the engine builds the real GPU/cam table.
 *
 * A null ref (focus release) or a ref whose cloud is not loaded resolves to null
 * → no tween. The tweens themselves are untouched; this only relocates their
 * TRIGGER from the deleted commitFocus helpers to a saga effect.
 */
import { extractSelectionRow } from '../helpers/extractSelectionRow';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { ResolveDeps } from '../../../@types/engine/ResolveDeps';

export type FocusTweenTable = {
  galaxyCatalog: (row: Extract<SelectionRow, { type: 'galaxyCatalog' }>) => void;
  structure: (row: Extract<SelectionRow, { type: 'structure' }>) => void;
  milkyWay: () => void;
};

export function makeRunFocusTween(
  resolveDeps: () => ResolveDeps,
  tweens: FocusTweenTable,
): (ref: SelectionRef | null) => void {
  return (ref) => {
    const row = extractSelectionRow(ref, resolveDeps());
    if (row === null) return;
    if (row.type === 'galaxyCatalog') tweens.galaxyCatalog(row);
    else if (row.type === 'structure') tweens.structure(row);
    else tweens.milkyWay();
  };
}

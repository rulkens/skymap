/**
 * composeSelectionRows — the one `SelectionResolver` the saga context and the
 * pick path both read (D5, Ruling 4). `rowsOf` is called per resolution, not
 * cached, so a Layer row `createLayers` appends after this resolver is built
 * is visible immediately. Focus ids resolve by claim-then-decode
 * (see `claimingSelectionRow`).
 *
 * `pickingOff` gates `resolvePick` ONLY — a deep link, a command-palette
 * row, or a restored URL selection must still resolve a kind a scene click
 * cannot reach, so `extractRow`/`resolveFocusId`/`focusIdOf` stay ungated. It
 * is required rather than defaulting to none: a caller that forgot it would
 * silently ignore every view's pick restriction, which no test or type would
 * catch. Tests that do not exercise the gate pass `tests/support/noKindsOff`.
 */

import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import type { SelectionResolver } from '../../../@types/engine/selection/SelectionResolver';
import { claimingSelectionRow } from '../../../utils/selection/claimingSelectionRow';

export function composeSelectionRows(
  rowsOf: () => readonly SelectionKindRow[],
  pickingOff: () => readonly string[],
): SelectionResolver {
  const claimingRow = (focusId: string): SelectionKindRow | null =>
    claimingSelectionRow(rowsOf(), focusId);
  return {
    resolvePick(pick) {
      if (pick === null) return null;
      const row = rowsOf().find((r) => r.pickSources.includes(pick.sourceCode));
      if (!row) {
        console.warn(`resolvePick: source code ${pick.sourceCode} is not a pickable surface`);
        return null;
      }
      if (pickingOff().includes(row.type)) return null;
      return row.resolvePick(pick);
    },

    extractRow(ref, simDays) {
      if (ref === null) return null;
      const row = rowsOf().find((r) => r.type === ref.type);
      return row ? row.extractRow(ref, simDays) : null;
    },

    resolveFocusId(focusId) {
      if (!focusId) return null;
      return claimingRow(focusId)?.focusId!.decode(focusId) ?? null;
    },

    claimedKind(focusId) {
      return claimingRow(focusId)?.type ?? null;
    },

    focusIdOf(ref) {
      const row = rowsOf().find((r) => r.type === ref.type);
      return row?.focusId ? row.focusId.encode(ref) : null;
    },
  };
}

/**
 * composeSelectionRows — the one `SelectionResolver` the saga context and the
 * pick path read (D5). `rowsOf` is read per call, so rows `createLayers` appends
 * later are seen; focus ids resolve claim-then-decode (`claimingSelectionRow`).
 * `pickingOff` gates `resolvePick` only: a deep link must still reach a kind a
 * click cannot. It is required, not defaulted, so a caller can't silently drop
 * every view's pick restriction (tests pass `tests/support/noKindsOff`).
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
      const row = focusId ? claimingRow(focusId) : null;
      return row ? row.focusId!.decode(focusId) : { kind: 'absent' };
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

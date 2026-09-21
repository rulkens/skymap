/**
 * composeSelectionRows — the one `SelectionResolver` the saga context and the
 * pick path both read (D5, Ruling 4). `rowsOf` is called per resolution, not
 * cached, so a Layer row `createLayers` appends after this resolver is built
 * is visible immediately. Focus ids resolve by claim-then-decode: the one
 * claiming row is authoritative even when its `decode` returns null; two or
 * more claims is a boot-shape bug and throws rather than picking a winner.
 *
 * `kindsEnabled` gates `resolvePick` ONLY — a deep link, a command-palette
 * row, or a restored URL selection must still resolve a kind a scene click
 * cannot reach, so `extractRow`/`resolveFocusId`/`focusIdOf` stay ungated. It
 * is required rather than defaulting to all-true: a caller that forgot it
 * would silently ignore every view's pick restriction, which no test or type
 * would catch. Tests that do not exercise the gate pass
 * `tests/support/allKindsEnabled`.
 */

import { SOURCE_REGISTRY } from '../../../data/sources';
import type { SelectionKind } from '../../../@types/engine/SelectionKind';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import type { SelectionResolver } from '../../../@types/engine/selection/SelectionResolver';

export function composeSelectionRows(
  rowsOf: () => readonly SelectionKindRow[],
  kindsEnabled: () => Record<SelectionKind, boolean>,
): SelectionResolver {
  return {
    resolvePick(pick) {
      if (pick === null) return null;
      const row = rowsOf().find((r) => r.pickSources.includes(pick.sourceCode));
      if (!row) {
        console.warn(`resolvePick: source code ${pick.sourceCode} is not a pickable surface`);
        return null;
      }
      if (!kindsEnabled()[row.type]) return null;
      return row.resolvePick(SOURCE_REGISTRY[pick.sourceCode], pick);
    },

    extractRow(ref, simDays) {
      if (ref === null) return null;
      const row = rowsOf().find((r) => r.type === ref.type);
      return row ? row.extractRow(ref, simDays) : null;
    },

    resolveFocusId(focusId) {
      if (!focusId) return null;
      const claiming = rowsOf().filter((r) => r.focusId?.claims(focusId));
      if (claiming.length === 0) return null;
      if (claiming.length > 1) {
        throw new Error(
          `composeSelectionRows: focus id "${focusId}" is claimed by more than one row (${claiming
            .map((r) => r.type)
            .join(', ')})`,
        );
      }
      return claiming[0]!.focusId!.decode(focusId);
    },

    focusIdOf(ref) {
      const row = rowsOf().find((r) => r.type === ref.type);
      return row?.focusId ? row.focusId.encode(ref) : null;
    },
  };
}

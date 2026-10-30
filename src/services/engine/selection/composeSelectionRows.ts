import { APP_SOURCE_REGISTRY } from '../../../compositions/appSources';
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
      return row.resolvePick(APP_SOURCE_REGISTRY[pick.sourceCode], pick);
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

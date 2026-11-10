/**
 * actionForRow — map a selected `ScoredRow` to the `PaletteAction` the container dispatches.
 * Focus kinds name the thing by URL deep-link id through the ONE `requestFocus` command
 * (`watchRequestFocusSaga` resolves the ref), so the palette never builds a ref. Alias rows carry
 * their id, built by `buildAliasIndex`, so the 'pgc-' grammar keeps one home. Fallback arms exist only so TS narrows.
 */

import type { ScoredRow } from '../../@types/palette/ScoredRow';
import type { PaletteAction } from '../../@types/palette/PaletteAction';

// The non-focus kinds have no harmless stand-in for their unreachable arm:
// `exhibit`/`tour` carry a closed-union id, and a `flyTo` fallback of 0,0,0 is
// a real place in the Gulf of Guinea. So they throw rather than fly somewhere.
function unreachableRow(): never {
  throw new Error('actionForRow: row.kind did not match its own table entry');
}

const ACTION_FOR_ROW: Record<ScoredRow['kind'], (row: ScoredRow) => PaletteAction> = {
  famous: (row) => ({ kind: 'focus', focusId: row.kind === 'famous' ? row.entry.id : '' }),
  alias: (row) => ({ kind: 'focus', focusId: row.kind === 'alias' ? row.entry.focusId : '' }),
  structure: (row) => ({ kind: 'focus', focusId: row.kind === 'structure' ? row.entry.id : '' }),
  exhibit: (row) =>
    row.kind === 'exhibit' ? { kind: 'exhibit', exhibitId: row.exhibit.id } : unreachableRow(),
  tour: (row) => (row.kind === 'tour' ? { kind: 'tour', tourId: row.tour.id } : unreachableRow()),
  layer: (row) => ({ kind: 'focus', focusId: row.kind === 'layer' ? row.entry.id : '' }),
  place: (row) =>
    row.kind === 'place'
      ? {
          kind: 'flyTo',
          lonDeg: row.entry.lonDeg,
          latDeg: row.entry.latDeg,
          altKm: row.entry.altKm,
        }
      : unreachableRow(),
};

export function actionForRow(row: ScoredRow): PaletteAction {
  return ACTION_FOR_ROW[row.kind](row);
}

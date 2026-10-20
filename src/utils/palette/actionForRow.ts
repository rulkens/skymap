/**
 * actionForRow — map a selected `ScoredRow` to the `PaletteAction` the container
 * dispatches. Focus kinds name the thing via the URL deep-link id scheme and go
 * through the ONE `requestFocus` command (`watchRequestFocusSaga` resolves the
 * ref, deferring on the catalog-landed pulse), so the palette never builds a ref.
 * `exhibit` and `tour` are takeovers and `place` is a `flyTo`, not focuses. Alias
 * rows reuse `encodeGalaxyId` so the 'pgc-' grammar keeps one home.
 * Table-dispatch on `row.kind`; the fallback arms exist only so TS narrows.
 */

import { encodeGalaxyId } from '../../services/url/encodeGalaxyId';
import { MILKY_WAY_FOCUS_ID } from '../../services/url/milkyWayFocusId';
import { BODY_FOCUS_PREFIX } from '../../services/url/bodyFocusId';
import { encodeStarFocusId } from '../../services/url/encodeStarFocusId';
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
  // An alias row is a GLADE/2MRS galaxy keyed by PGC. famousId is null (alias
  // rows are non-famous) and ra/dec/distMpc are unused because a PGC objId (> 0) takes
  // the catalog-id rung of the ladder before the pos@ rung.
  alias: (row) => ({
    kind: 'focus',
    focusId:
      row.kind === 'alias'
        ? encodeGalaxyId({
            source: row.entry.source,
            famousId: null,
            // AliasIndexEntry.pgc is a number (Redux-serializable); encodeGalaxyId's
            // ladder is shared with SDSS's 19-digit objID, which needs bigint.
            objId: BigInt(row.entry.pgc),
            ra: 0,
            dec: 0,
            distMpc: 0,
          })
        : '',
  }),
  structure: (row) => ({ kind: 'focus', focusId: row.kind === 'structure' ? row.entry.id : '' }),
  milkyWay: () => ({ kind: 'focus', focusId: MILKY_WAY_FOCUS_ID }),
  body: (row) => ({
    kind: 'focus',
    focusId: row.kind === 'body' ? `${BODY_FOCUS_PREFIX}${row.body.id}` : '',
  }),
  starCatalog: (row) => ({
    kind: 'focus',
    focusId:
      row.kind === 'starCatalog'
        ? encodeStarFocusId({ type: 'starCatalog', source: row.source, index: row.index })
        : '',
  }),
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

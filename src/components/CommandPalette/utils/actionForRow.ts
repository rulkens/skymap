/**
 * actionForRow — map a selected `ScoredRow` to the `PaletteAction` the
 * container dispatches on. Five kinds resolve to a focus id via the same
 * scheme the URL deep-link layer uses. Three do not: `exhibit` and `tour`
 * resolve to their own action kinds, since picking one is a takeover rather
 * than a focus, and `place` to a `flyTo` — an Earth place is a camera command,
 * not a focusable ref.
 *
 * The five focus kinds route through the ONE selection command, `requestFocus`,
 * whose saga (`watchRequestFocusSaga`) resolves a durable id to a `SelectionRef`
 * — deferring on the catalog-landed count pulse until the cloud is in. The palette therefore
 * never resolves a ref itself; it only names the thing. That keeps React on the
 * "single command->ref bridge" the saga documents, instead of two of the three
 * rows (alias, Milky Way) bypassing it with a pre-built ref.
 *
 *   - famous   → the curated seed id ('m31'); the resolver's `resolveFocusId`
 *                scans the galaxy store's famous meta rows.
 *   - alias    → the shared galaxy-id ladder (`encodeGalaxyId`), which yields
 *                'pgc-<n>' for the GLADE/2MRS PGC the alias row carries. We reuse
 *                that encoder rather than re-spell the 'pgc-' grammar here so the
 *                encode↔decode round-trip keeps one home.
 *   - structure→ the record's own durable `${category}-${seedId}` id, which
 *                the resolver's `resolveFocusId` accepts and `structures.byId`
 *                resolves. No re-encoding — the store already holds the id.
 *   - milkyWay → the fixed singleton literal `MILKY_WAY_FOCUS_ID`.
 *   - body     → the seed id under the shared `BODY_FOCUS_PREFIX` (`body-earth`),
 *                which the resolver's `resolveFocusId` strips back to a body ref.
 *   - exhibit  → `{ kind: 'exhibit', exhibitId }`, the row's own registry id.
 *   - tour     → `{ kind: 'tour', tourId }`, the row's own registry id.
 *   - place    → the entry's own lon/lat/alt, verbatim, as a `flyTo`.
 *
 * TABLE-DISPATCH on `row.kind` (simplicity convention item 7): a new row kind is
 * one row here, not a new predicate branch. The fallback arms are unreachable —
 * the table is indexed by the row's own tag — but TS needs each arm to narrow.
 */

import { encodeGalaxyId } from '../../../services/url/encodeGalaxyId';
import { MILKY_WAY_FOCUS_ID } from '../../../services/url/milkyWayFocusId';
import { BODY_FOCUS_PREFIX } from '../../../services/url/bodyFocusId';
import type { ScoredRow } from '../paletteRowModel';
import type { PaletteAction } from '../../../@types/palette/PaletteAction';

// The non-focus kinds have no harmless stand-in for their unreachable arm:
// `exhibit`/`tour` carry a closed-union id, and a `flyTo` fallback of 0,0,0 is
// a real place in the Gulf of Guinea. So they throw rather than fly somewhere.
function unreachableRow(): never {
  throw new Error('actionForRow: row.kind did not match its own table entry');
}

const ACTION_FOR_ROW: Record<ScoredRow['kind'], (row: ScoredRow) => PaletteAction> = {
  famous: (row) => ({ kind: 'focus', focusId: row.kind === 'famous' ? row.entry.id : '' }),
  // An alias row is a GLADE/2MRS galaxy keyed by PGC. famousId is null (alias
  // rows are non-famous) and ra/dec are unused because a PGC objId (> 0) takes
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
          })
        : '',
  }),
  structure: (row) => ({ kind: 'focus', focusId: row.kind === 'structure' ? row.entry.id : '' }),
  milkyWay: () => ({ kind: 'focus', focusId: MILKY_WAY_FOCUS_ID }),
  body: (row) => ({
    kind: 'focus',
    focusId: row.kind === 'body' ? `${BODY_FOCUS_PREFIX}${row.body.id}` : '',
  }),
  exhibit: (row) =>
    row.kind === 'exhibit' ? { kind: 'exhibit', exhibitId: row.exhibit.id } : unreachableRow(),
  tour: (row) => (row.kind === 'tour' ? { kind: 'tour', tourId: row.tour.id } : unreachableRow()),
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

/**
 * actionForRow — map a selected `ScoredRow` to the `PaletteAction` the
 * container dispatches on, today always `{ kind: 'focus', focusId }` using
 * the same id scheme the URL deep-link layer uses.
 *
 * Every palette pick routes through the ONE selection command, `requestFocus`,
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

const FOCUS_ID: Record<ScoredRow['kind'], (row: ScoredRow) => string> = {
  famous: (row) => (row.kind === 'famous' ? row.entry.id : ''),
  // An alias row is a GLADE/2MRS galaxy keyed by PGC. famousId is null (alias
  // rows are non-famous) and ra/dec are unused because a PGC objId (> 0) takes
  // the catalog-id rung of the ladder before the pos@ rung.
  alias: (row) =>
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
  structure: (row) => (row.kind === 'structure' ? row.entry.id : ''),
  milkyWay: () => MILKY_WAY_FOCUS_ID,
  body: (row) => (row.kind === 'body' ? `${BODY_FOCUS_PREFIX}${row.body.id}` : ''),
};

export function actionForRow(row: ScoredRow): PaletteAction {
  return { kind: 'focus', focusId: FOCUS_ID[row.kind](row) };
}

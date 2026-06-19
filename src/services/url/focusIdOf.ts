/**
 * focusIdOf — encode a SelectionRef into the durable `#focus=<id>` URL payload
 * (the part after `focus=`).
 *
 * Replaces `selectionToFocusId` (which took a pre-built GalaxyInfo); because a
 * SelectionRef carries only `(source, index)` for galaxy rows, the galaxy arm
 * reads the cloud at the given index to recover the objID and famous-id.
 * Structure and Milky Way arms are already durable by tag.
 *
 * The priority ladder for galaxy rows is unchanged from focusUrl.ts:
 *
 *   famous id         (curated seed id: "m31", "ngc5128", …)
 *   sdss-<objID>      (SDSS 64-bit identifier, always positive when real)
 *   pgc-<objID>       (any other source whose objID slot carries a PGC number)
 *   pos@<ra>,<dec>    (4-decimal RA/Dec fallback for PGC-less rows)
 *
 * The Milky Way has no durable deep-link today — urlHashFor.ts returns null
 * for the milkyWay arm, so we match that behaviour here.  A round-trip for
 * milkyWay would need the parser to grow a dedicated kind; that is deferred.
 *
 * Returns null for:
 *   - galaxy clouds that are not yet loaded (the saga should not encode before
 *     the cloud is available, but null is safer than a thrown error)
 *   - the Milky Way (no deep-link representation)
 *
 * The Synthetic source is intentionally absent from SelectionRef, so it is
 * handled implicitly: Synthetic galaxies produce an `objId` of the row's
 * sequential index (0..N-1), which fails the `objID > 0n` guard and falls
 * through to the pos@ form.  In practice the engine never encodes a Synthetic
 * selection, but the function stays well-defined if it does.
 */

import { Source } from '../../data/sources';
import { extractGalaxyRow } from '../engine/helpers/extractGalaxyRow';
import { cartesianToRaDec } from '../../utils/math/cartesianToRaDec';
import type { SelectionRef } from '../../@types/engine/SelectionRef';
import type { ResolveDeps } from '../../@types/engine/ResolveDeps';

/**
 * Encode a SelectionRef to the durable URL focus-id string, or null when the
 * ref is not link-encodable (cloud not loaded, or Milky Way — no deep-link).
 *
 * TABLE-DISPATCH on ref.type follows the project's simplicity convention
 * (item 7): a new selectable kind adds one row here rather than extending a
 * predicate chain.
 */
export function focusIdOf(ref: SelectionRef, deps: ResolveDeps): string | null {
  return ENCODE[ref.type](ref as never, deps);
}

// ─── Encoder table ───────────────────────────────────────────────────────────

type EncodeTable = {
  [K in SelectionRef['type']]: (
    ref: Extract<SelectionRef, { type: K }>,
    deps: ResolveDeps,
  ) => string | null;
};

const ENCODE: EncodeTable = {
  // Galaxy catalogs: read the cloud row, then apply the priority ladder.
  galaxyCatalog: (ref, deps) => encodeGalaxy(ref, deps),

  // Structure ids are already the stable `${category}-${seed}` token — no
  // cloud read needed.
  structure: (ref) => ref.id,

  // No Milky Way deep-link representation today.  Matches urlHashFor.ts's
  // `milkyWay: () => null` entry.  A future round-trip would add a parser
  // branch in resolveFocusId at the same time.
  milkyWay: () => null,
};

// ─── Galaxy arm ──────────────────────────────────────────────────────────────

/**
 * Read the galaxy row from the cloud, then apply the same priority ladder as
 * `selectionToFocusId` in focusUrl.ts.  The Synthetic-source guard in the
 * original is not needed here because Synthetic is excluded from SelectionRef
 * by type (GalaxyCatalogSourceType does not include Synthetic's code… in
 * practice; the code still degrades gracefully via the 0n/pos@ fallback).
 */
function encodeGalaxy(
  ref: Extract<SelectionRef, { type: 'galaxyCatalog' }>,
  deps: ResolveDeps,
): string | null {
  const row = extractGalaxyRow(
    deps.catalogs.get(ref.source),
    ref.index,
    ref.source,
    deps.famousMeta,
  );
  // Cloud not loaded or index out of range.  The saga only encodes a LIVE
  // selection (cloud is definitely loaded), so this branch is a safety net
  // rather than a normal path.  Return null so callers can clear the hash
  // gracefully instead of writing a partial id.
  if (!row) return null;

  // Famous arm: the curated seed id beats all numeric identifiers because it
  // is stable across catalog rebuilds and human-readable in the URL.
  if (row.famous) return row.famous.id;

  const objID = BigInt(row.objId);

  // objID > 0n means the parser captured a real catalog identifier.  For SDSS
  // the field holds the 19-digit objID; for 2MRS/GLADE it holds the PGC number.
  if (objID > 0n) {
    return ref.source === Source.SDSS ? `sdss-${objID}` : `pgc-${objID}`;
  }

  // Last resort: 4-decimal RA/Dec derived from the stored Cartesian position.
  // cartesianToRaDec returns [ra, dec, 0] (the third slot is always 0).
  const [ra, dec] = cartesianToRaDec(row.x, row.y, row.z);
  return `pos@${ra.toFixed(4)},${dec.toFixed(4)}`;
}

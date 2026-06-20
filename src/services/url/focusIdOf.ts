/**
 * focusIdOf — encode a SelectionRef into the durable `#focus=<id>` URL payload
 * (the part after `focus=`).
 *
 * Replaces `selectionToFocusId` (which took a pre-built GalaxyInfo); because a
 * SelectionRef carries only `(source, index)` for galaxy rows, the galaxy arm
 * reads the cloud at the given index to recover the objID and famous-id.
 * Structure and Milky Way arms are already durable by tag.
 *
 * The priority ladder for galaxy rows lives in encodeGalaxyId.ts — the shared
 * home both galaxy encoders (here and selectionToFocusId) delegate to.
 *
 * The Milky Way has no durable deep-link today — urlHashFor.ts returns null
 * for the milkyWay arm, so we match that behaviour here.  A round-trip for
 * milkyWay would need the parser to grow a dedicated kind; that is deferred.
 *
 * Returns null for:
 *   - galaxy clouds that are not yet loaded (the saga should not encode before
 *     the cloud is available, but null is safer than a thrown error)
 *   - the Milky Way (no deep-link representation)
 */

import { encodeGalaxyId } from './encodeGalaxyId';
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
 * Read the galaxy row from the cloud, then delegate to the shared encodeGalaxyId
 * ladder (the same one selectionToFocusId uses).  Synthetic resolves to null via
 * that shared guard — unreachable here anyway, since GalaxyCatalogSourceType
 * excludes Synthetic from SelectionRef.
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

  // cartesianToRaDec returns [ra, dec, 0] (the third slot is always 0).
  const [ra, dec] = cartesianToRaDec(row.x, row.y, row.z);
  return encodeGalaxyId({
    source: ref.source,
    famousId: row.famous?.id ?? null,
    objId: BigInt(row.objId),
    ra,
    dec,
  });
}

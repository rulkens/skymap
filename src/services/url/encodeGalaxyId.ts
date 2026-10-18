/**
 * encodeGalaxyId — the ONE home for the galaxy `#focus=<id>` priority ladder.
 *
 * Both galaxy encoders feed this function normalized fields:
 *   - selectionToFocusId (focusUrl.ts)           — from a built GalaxyInfo
 *   - galaxyCatalogSelectionRow's focusId.encode — from a record row
 *
 * Keeping the ladder in a single place means the two entry points can never
 * silently drift in grammar (a prefix or a pos-precision change re-anchors a
 * shared URL onto a different galaxy). The composed resolver's `resolveFocusId`
 * is the inverse of this function; the encode↔decode round-trip parity test is
 * the guard that keeps this home single.
 *
 * The ladder:
 *   - famous id          : a curated seed id ("m31") beats every numeric id —
 *                          stable across rebuilds and human-readable.
 *   - sdss-/pgc- <objId> : objId > 0n is a real catalog identifier (SDSS's
 *                          19-digit objID exceeds JS Number's safe range; every
 *                          other source's slot carries a PGC number).
 *   - pos@<ra>,<dec>,<d> : 4-decimal RA/Dec (~0.4 arcsec) plus the distance to
 *                          0.01 Mpc, so a chunked catalog can find the cell that
 *                          holds it; the decoder still reads legacy `pos@<ra>,<dec>`.
 */

import { Source } from '../../data/sources';
import type { SourceType } from '../../@types/data/SourceType';

export function encodeGalaxyId(galaxy: {
  readonly source: SourceType;
  readonly famousId: string | null;
  readonly objId: bigint;
  readonly ra: number;
  readonly dec: number;
  readonly distMpc: number;
}): string {
  if (galaxy.famousId) return galaxy.famousId;
  if (galaxy.objId > 0n) {
    return galaxy.source === Source.SDSS ? `sdss-${galaxy.objId}` : `pgc-${galaxy.objId}`;
  }
  return `pos@${galaxy.ra.toFixed(4)},${galaxy.dec.toFixed(4)},${galaxy.distMpc.toFixed(2)}`;
}

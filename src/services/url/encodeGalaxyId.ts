/**
 * encodeGalaxyId — the ONE home for the galaxy `#focus=<id>` priority ladder.
 *
 * Both galaxy encoders feed this function normalized fields:
 *   - selectionToFocusId (focusUrl.ts) — from a built GalaxyInfo
 *   - focusIdOf (focusIdOf.ts)         — from a cloud row via extractGalaxyRow
 *
 * Keeping the ladder in a single place means the two entry points can never
 * silently drift in grammar (a prefix or a pos-precision change re-anchors a
 * shared URL onto a different galaxy).  `resolveFocusId` is the inverse of this
 * function; the encode↔decode round-trip parity test is the guard that keeps
 * this home single.
 *
 * The ladder, with the rationale that used to live in both encoders:
 *   - Synthetic → null   : procedurally-generated rows have no durable identity
 *                          across rebuilds, so a shared URL can't re-find them.
 *   - famous id          : a curated seed id ("m31") beats every numeric id —
 *                          stable across rebuilds and human-readable.
 *   - sdss-/pgc- <objId> : objId > 0n is a real catalog identifier (SDSS's
 *                          19-digit objID exceeds JS Number's safe range; every
 *                          other source's slot carries a PGC number).
 *   - pos@<ra>,<dec>     : 4-decimal RA/Dec (~0.4 arcsec) — fine enough that no
 *                          real galaxy pair collides, coarse enough to stay
 *                          readable; survives rebuilds where a raw index would not.
 */

import { Source } from '../../data/sources';
import type { SourceType } from '../../@types/data/SourceType';

export function encodeGalaxyId(galaxy: {
  readonly source: SourceType;
  readonly famousId: string | null;
  readonly objId: bigint;
  readonly ra: number;
  readonly dec: number;
}): string | null {
  // Synthetic rows have no durable identity across rebuilds.
  if (galaxy.source === Source.Synthetic) return null;
  // Curated famous seed id beats every numeric id — stable + human-readable.
  if (galaxy.famousId) return galaxy.famousId;
  // objId > 0n means a real catalog identifier: SDSS 19-digit objID, else a PGC.
  if (galaxy.objId > 0n) {
    return galaxy.source === Source.SDSS ? `sdss-${galaxy.objId}` : `pgc-${galaxy.objId}`;
  }
  // Last resort: 4-decimal RA/Dec (~0.4 arcsec — no real galaxy pair collides).
  return `pos@${galaxy.ra.toFixed(4)},${galaxy.dec.toFixed(4)}`;
}

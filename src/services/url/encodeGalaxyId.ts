/**
 * encodeGalaxyId — the ONE home for the galaxy `#focus=<id>` priority ladder,
 * fed by `selectionToFocusId` (focusUrl.ts) and `galaxyCatalogSelectionRow`'s
 * `focusId.encode`, so the two can never drift in grammar. `resolveFocusId` is
 * the inverse; the round-trip parity test guards that.
 *
 *   - famous id          : a curated seed id ("m31") beats every numeric id.
 *   - sdss-/pgc- <objId> : objId > 0n is a catalog identifier (SDSS's 19-digit
 *                          objID exceeds JS Number's safe range; every other
 *                          source's slot carries a PGC number).
 *   - pos@<ra>,<dec>,<d> : 4-decimal RA/Dec (~0.4 arcsec) plus distance to 0.01
 *                          Mpc so a chunked catalog can find the holding cell;
 *                          the decoder still reads legacy `pos@<ra>,<dec>`.
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

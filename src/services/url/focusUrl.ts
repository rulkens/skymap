/**
 * Codec for the `#focus=<id>` URL hash that makes a galaxy selection
 * shareable.  Pure functions only — no DOM access, no React, no engine
 * coupling — so the codec is testable in isolation and reusable from
 * both the client mount path and tooling/tests.
 *
 * Why a hash, not a query string?  We host the app on Cloudflare
 * Workers Assets with a single static shell.  Query strings would force
 * the asset router to special-case `?focus=…` paths (or cause a 404
 * cache-poisoning footgun); the hash never reaches the server, so it's
 * pure-frontend with no infra changes.
 *
 * The id formats mirror the priority ladder used elsewhere in the
 * project for "what name does this galaxy go by":
 *
 *   m31              — famous-catalog seed id (stable across rebuilds)
 *   pgc-2789         — any source with a real PGC number we trust
 *                      (PGC = Principal Galaxies Catalog, maintained by
 *                      HyperLEDA; widely cross-indexed by NED/SIMBAD)
 *   sdss-<objID>     — SDSS row whose objID is the canonical handle
 *                      (19-digit bigint, exceeds JS Number safe range)
 *   pos@<ra>,<dec>   — fallback for 2MRS/GLADE rows without a PGC
 *
 * Why 4-decimal RA/Dec for the pos fallback?  4 decimals in degrees is
 * ~0.4 arcsec — fine enough that two real galaxies never collide in the
 * fallback bucket (the closest known galaxy pairs sit at ~5 arcsec
 * separation, two orders of magnitude above 0.4″) and coarse enough
 * that the URL stays readable.  The alternative — encoding the raw
 * `globalIdx` — is cheaper but breaks across catalog rebuilds, since
 * `globalIdx` reflects the order rows happen to land in `.bin` files
 * after parsing + cross-match dedup.
 *
 * Why is Synthetic-source not link-encodable?  Synthetic rows are
 * generated procedurally at startup with no durable identity — there's
 * no way for a recipient of a shared URL to land on "the same" synthetic
 * galaxy a sender saw.  Returning null lets the caller (the URL-sync
 * hook) clear the hash gracefully instead of writing nonsense.
 */

import type { GalaxyInfo } from '../../@types/engine/GalaxyInfo';
import { Source } from '../../data/sources';

/**
 * Build the `#focus=<id>` payload (the bit after `=`) for the given
 * selection, or `null` when the row isn't link-encodable.
 *
 * The priority ladder favours human-meaningful ids over coordinates:
 * a curated famous id beats a PGC, a PGC beats an SDSS objID (because
 * PGC numbers are smaller + cross-indexed by NED), and only true
 * orphans fall back to the pos@ form.
 */
export function selectionToFocusId(info: GalaxyInfo): string | null {
  // Synthetic rows have no durable identity across rebuilds.  Returning
  // null here lets the URL-sync hook clear the hash instead of writing
  // a nonsense identifier that will resolve to nothing on reload.
  if (info.source === Source.Synthetic) return null;

  // Famous-row enrichment is populated by `galaxyInfoBuilder` from the
  // famous_meta.json sidecar.  When present, its `id` is the stable
  // seed id ("m31", "ngc5128") that we want to surface in the URL.
  if (info.famous) return info.famous.id;

  // objID > 0n means the parser captured a real catalog identifier.
  // For SDSS that's the 19-digit objID; for 2MRS/GLADE it's the PGC
  // number (the GLADE parser writes PGC into objID, and the 2MRS
  // cross-match copies it across).
  if (info.objID > 0n) {
    return info.source === Source.SDSS ? `sdss-${info.objID}` : `pgc-${info.objID}`;
  }

  // Last resort: 4-decimal RA/Dec.  No URL-encoding needed — the
  // characters `0-9`, `.`, `,`, `-` are all safe in a hash fragment.
  return `pos@${info.ra.toFixed(4)},${info.dec.toFixed(4)}`;
}

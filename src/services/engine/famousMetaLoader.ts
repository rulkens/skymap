/**
 * famousMetaLoader — fetch + parse the runtime sidecars that accompany
 * `famous.bin`.  Two JSON files:
 *
 *   - `famous_meta.json`  (per-localIdx → { id, names, description, type })
 *   - `famous_xrefs.json` (per-id → { source, localIdx, distanceArcsec } | null)
 *
 * Why two files?  `famous_meta` is indexed by the famous catalog's local
 * index — the index the renderer's pick code returns.  `famous_xrefs`
 * is indexed by the human-readable `id` so the InfoCard can look up
 * the cross-match by name without a reverse pass.  Either could be
 * derived from the other, but eating the duplication at build time
 * (both written by `tools/buildFamous.ts`) keeps the runtime lookup
 * paths O(1) and avoids stitching state inside the engine.
 *
 * Both files are tiny — even a 150-entry catalog fits in well under
 * 100 KB combined — so we load them both at startup before the first
 * pick.  No streaming or lazy-load complexity.
 */

/** One famous-galaxy metadata record, indexed by its local position in famous.bin. */
export type FamousMetaEntry = {
  id: string;
  names: string[];
  description: string;
  type: string;
};

/** One cross-match record. `null` means "no match within MATCH_THRESHOLD_ARCSEC". */
export type FamousXref = {
  source: 'TwoMRS' | 'Glade';
  localIdx: number;
  distanceArcsec: number;
};

/** The whole xrefs object, keyed by famous id. */
export type FamousXrefMap = Record<string, FamousXref | null>;

/**
 * Parse `famous_meta.json` content.  Throws on schema mismatch.  Public
 * to allow unit testing without hitting the network.
 */
export function parseFamousMeta(rawJson: string): FamousMetaEntry[] {
  const parsed = JSON.parse(rawJson);
  if (!Array.isArray(parsed)) {
    throw new Error('famous_meta.json: root must be an array');
  }
  return parsed as FamousMetaEntry[];
}

/**
 * Parse `famous_xrefs.json` content.  Throws on schema mismatch.
 */
export function parseFamousXrefs(rawJson: string): FamousXrefMap {
  const parsed = JSON.parse(rawJson);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('famous_xrefs.json: root must be an object');
  }
  return parsed as FamousXrefMap;
}

/**
 * Translate the GLADE local indices in a `FamousXrefMap` through an
 * old → new index table produced by `cloudLoader`'s far-galaxy
 * decimation.  Necessary because the sidecar JSON was authored against
 * the original GLADE binary, but the runtime cloud is a decimated
 * subset and the original `localIdx` values would resolve to the wrong
 * galaxies (or out-of-bounds, when a row was dropped).
 *
 * Behaviour:
 *   - `null` xrefs pass through unchanged (no cross-match found at
 *     build time).
 *   - Non-Glade entries (currently `source: 'TwoMRS'`) pass through
 *     unchanged — only GLADE was decimated.
 *   - GLADE entries whose original row maps to `-1` (dropped) become
 *     `null`.  Same shape as a missing match; the InfoCard's existing
 *     `null` branch already handles this case gracefully.
 *   - Surviving GLADE entries get their `localIdx` rewritten in place.
 *
 * Returns a NEW map — the input is treated as immutable so other
 * possible future consumers (tests, dev-tools) keep their pristine copy.
 */
export function remapGladeXrefs(
  xrefs: FamousXrefMap,
  gladeIdxRemap: Int32Array,
): FamousXrefMap {
  const out: FamousXrefMap = {};
  for (const [id, xref] of Object.entries(xrefs)) {
    if (xref === null || xref.source !== 'Glade') {
      out[id] = xref;
      continue;
    }
    const newIdx = gladeIdxRemap[xref.localIdx];
    if (newIdx === undefined || newIdx < 0) {
      out[id] = null;
      continue;
    }
    out[id] = { ...xref, localIdx: newIdx };
  }
  return out;
}

/**
 * Fetch and parse both sidecars in parallel.  Returns null/empty values
 * when either file 404s — most users will never run `npm run
 * build-famous`, so absent sidecars must not break the engine.
 */
export async function loadFamousSidecars(): Promise<{
  meta: FamousMetaEntry[];
  xrefs: FamousXrefMap;
}> {
  const [metaRes, xrefsRes] = await Promise.allSettled([
    fetch('/data/famous_meta.json'),
    fetch('/data/famous_xrefs.json'),
  ]);
  const meta =
    metaRes.status === 'fulfilled' && metaRes.value.ok
      ? parseFamousMeta(await metaRes.value.text())
      : [];
  const xrefs =
    xrefsRes.status === 'fulfilled' && xrefsRes.value.ok
      ? parseFamousXrefs(await xrefsRes.value.text())
      : {};
  return { meta, xrefs };
}

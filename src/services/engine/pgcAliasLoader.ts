/**
 * pgcAliasLoader — fetch + parse the runtime `pgc_aliases.json` sidecar
 * built by `tools/buildPgcAliases.ts`.
 *
 * The sidecar maps numeric PGCs (HyperLEDA primary identifier) to the
 * human-typable names a user might enter in the Cmd+K palette: `NGC 4565`,
 * `M 31`, `UGCA 13`, etc.  GLADE bins already store PGC in their
 * `objIDs` slot (PR #4); 2MRS got PGCs through the GLADE→2MRS cross-
 * match (PR #7).  Joining the two at runtime gives the palette a
 * "search across every named galaxy in 2MRS+GLADE" capability without
 * bumping the binary format.
 *
 * ### Why JSON, not packed binary?
 *
 * The sidecar is ~1.7 MB on disk — small enough that the encoding cost
 * of JSON (~2× a packed binary) is dominated by the network round-trip
 * anyway.  More importantly, JSON is human-inspectable: a developer
 * debugging a missing-alias report can `cat public/data/pgc_aliases.json
 * | jq` and immediately see what the build produced.  The runtime
 * memory cost (a Map<bigint, string[]>) is similar regardless of wire
 * format.
 *
 * ### Why bigint keys at runtime?
 *
 * GLADE/2MRS store PGCs in `BigUint64Array` (the `objIDs` slot is a
 * generic 64-bit ID column shared with SDSS, where numeric values
 * routinely exceed 2^53).  The most-common downstream use is
 * `aliasMap.get(cloud.objIDs[i])` — using bigints as the Map key
 * removes a per-lookup `Number(bigint)` conversion that would otherwise
 * fire millions of times during the post-load join.
 *
 * ### Lazy by default
 *
 * 1.7 MB of JSON is too much to load on engine startup (it adds ~150 ms
 * to the cold-load critical path on a slow connection, before the user
 * has even pressed Cmd+K).  Callers should invoke `loadPgcAliases()` at
 * the moment of first interest — typically when the palette opens for
 * the first time.  Cache the resulting Map in App-level state and
 * reuse it on subsequent palette opens.
 *
 * ### 404-tolerance
 *
 * `npm run build-pgc-aliases` is an opt-in, multi-hour fetch.  Most
 * developer clones won't have the sidecar; the loader returns an empty
 * Map in that case so the palette still works (alias search just
 * silently skips).  We mirror the same fallback shape used by
 * `famousMetaLoader.loadFamousSidecars`.
 */

import { dataUrl } from './cloudLoader';

/**
 * The JSON-on-disk shape: `{ "<pgc>": ["NGC 4565", "UGC 7772", …], … }`.
 * Public to support unit tests against `parsePgcAliases` without
 * spinning up `fetch`.
 */
export type PgcAliasJsonShape = Record<string, string[]>;

/**
 * Parse the `pgc_aliases.json` content into a runtime-shaped Map.
 *
 * Throws on schema mismatch (non-object root, malformed entries) so a
 * corrupted sidecar fails loudly during App init rather than silently
 * disabling search.  Empty Maps and absent keys return cleanly.
 */
export function parsePgcAliases(rawJson: string): Map<bigint, readonly string[]> {
  const parsed = JSON.parse(rawJson);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('pgc_aliases.json: root must be an object');
  }
  const result = new Map<bigint, readonly string[]>();
  for (const [key, val] of Object.entries(parsed as PgcAliasJsonShape)) {
    if (!Array.isArray(val)) continue;
    // BigInt parses decimal strings directly.  An exception here
    // would be a malformed key — let it propagate so the issue is
    // visible during development.
    let pgc: bigint;
    try {
      pgc = BigInt(key);
    } catch {
      // Skip malformed key but don't fail the whole parse — the user
      // still gets the rest of the index, which is preferable to a
      // null Map on first palette open.
      continue;
    }
    // Defensive copy so callers can freely mutate the result of
    // `Object.entries` without affecting the loader's internal state
    // — and so the readonly type assertion below is honest.
    result.set(pgc, val.slice());
  }
  return result;
}

/**
 * Fetch and parse the alias sidecar.  Returns an empty Map on 404,
 * malformed JSON, or any network error — same fail-soft contract as
 * `loadFamousSidecars`.  Callers should expect "no aliases" to be a
 * normal state, not an error.
 *
 * The fetch goes through `dataUrl()` so production routes through R2
 * and dev hits the relative `/data/` path.  Without the prefix, prod
 * would land on Workers Assets, 404, fall back to the SPA index, and
 * `JSON.parse` would explode on the doctype.
 */
export async function loadPgcAliases(): Promise<Map<bigint, readonly string[]>> {
  try {
    const res = await fetch(dataUrl('pgc_aliases.json'));
    if (!res.ok) return new Map();
    const text = await res.text();
    return parsePgcAliases(text);
  } catch {
    // Network error / parse error: treat as "no aliases" so the
    // palette's famous-only search still works.
    return new Map();
  }
}

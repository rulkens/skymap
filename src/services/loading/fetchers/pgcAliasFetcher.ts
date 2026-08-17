/**
 * pgcAliasFetcher — fetches the runtime PGC→names sidecar for the Cmd+K
 * palette's alias search. Lazy: engine code calls this slot's load()
 * only on first palette open, not at boot, because the JSON is ~1.7 MB
 * and the user may never open the palette.
 *
 * ### Why bigint keys at runtime?
 *
 * GLADE/2MRS store PGCs in `BigUint64Array` (the `objIDs` slot is a
 * generic 64-bit ID column shared with SDSS, where numeric values
 * routinely exceed 2^53). The most-common downstream use is
 * `aliasMap.get(cloud.objIDs[i])` — using bigints as the Map key
 * removes a per-lookup `Number(bigint)` conversion that would otherwise
 * fire millions of times during the post-load join.
 *
 * ### Why throw on 404?
 *
 * Same reasoning as famousGalaxiesMetaFetcher: the "absent sidecar = feature
 * off" mapping lives a layer up, in the slot subscriber. The fetcher
 * reports HTTP truth; the slot's error handler maps it to an empty
 * Map so the palette's famous-only search still works. This also
 * makes retry policy honest — a 5xx flake retries, a 404 gives up.
 */
import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { PgcAliasJsonShape } from '../../../@types/loading/PgcAliasJsonShape';
import type { PgcAliasMap } from '../../../@types/loading/PgcAliasMap';
import { dataUrl, HttpError } from '../fetchWithProgress';

/**
 * Parse the `pgc_aliases.json` content into a runtime-shaped Map.
 *
 * Throws on schema mismatch (non-object root) so a corrupted sidecar
 * fails loudly during App init rather than silently disabling search.
 * Malformed individual keys/values are skipped (not thrown) so a single
 * bad entry doesn't poison the rest of the index.
 */
export function parsePgcAliases(rawJson: string): PgcAliasMap {
  const parsed = JSON.parse(rawJson);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('pgc_aliases.json: root must be an object');
  }
  const result = new Map<bigint, readonly string[]>();
  for (const [key, val] of Object.entries(parsed as PgcAliasJsonShape)) {
    if (!Array.isArray(val)) continue;
    // BigInt parses decimal strings directly. Skip malformed keys but
    // don't fail the whole parse — the user still gets the rest of the
    // index, which is preferable to a null Map on first palette open.
    let pgc: bigint;
    try {
      pgc = BigInt(key);
    } catch {
      continue;
    }
    // Defensive copy so callers can freely mutate the result of
    // `Object.entries` without affecting the loader's internal state —
    // and so the readonly type assertion is honest.
    result.set(pgc, val.slice());
  }
  return result;
}

export const pgcAliasFetcher: Fetcher<PgcAliasMap, void> = async (_req, signal) => {
  const url = dataUrl('pgc_aliases.json');
  const res = await fetch(url, { signal });
  if (!res.ok) throw new HttpError(res.status, url);
  return parsePgcAliases(await res.text());
};

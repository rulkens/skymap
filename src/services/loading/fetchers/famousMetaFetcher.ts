/**
 * famousMetaFetcher — fetches the two famous-galaxy sidecars in parallel
 * and returns a combined { meta, xrefs } payload.
 *
 * ### Why one fetcher returning both?
 *
 * The existing famousMetaLoader fetched them in parallel and returned a
 * combined object; consumers always want both together. Splitting them
 * into two slots would force the engine to coordinate two `ready` events
 * for what is one logical asset. Keeping them paired matches the actual
 * call site shape — the InfoCard needs both `meta` (for descriptions)
 * and `xrefs` (for cross-survey selection) on the same render.
 *
 * ### Why throw on 404 here, when the old loader returned empty?
 *
 * The old `loadFamousSidecars` swallowed 404s into empty values to keep
 * the engine running on developer clones without `npm run build-famous`.
 * The new design pushes that decision up: the slot subscriber maps
 * `kind: 'error'` → "feature off" by calling onFamousMetaReady with empty
 * shapes (see Task 10). Keeping the fetcher honest about HTTP status
 * lets the retry policy distinguish "really gone" (404, give up) from
 * "transient flake" (5xx, retry).
 *
 * Parser implementations come from the existing famousMetaLoader.ts;
 * preserved verbatim with their schema-validation throws so a corrupted
 * sidecar fails loudly rather than silently disabling search.
 */
import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { FamousMetaEntry } from '../../../@types/loading/FamousMetaEntry';
import type { FamousXrefMap } from '../../../@types/loading/FamousXrefMap';
import type { FamousPayload } from '../../../@types/loading/FamousPayload';
import { HttpError, dataUrl } from '../fetchWithProgress';

/**
 * Parse `famous_meta.json` content. Throws on schema mismatch. Public
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
 * Parse `famous_xrefs.json` content. Throws on schema mismatch.
 */
export function parseFamousXrefs(rawJson: string): FamousXrefMap {
  const parsed = JSON.parse(rawJson);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('famous_xrefs.json: root must be an object');
  }
  return parsed as FamousXrefMap;
}

export const famousMetaFetcher: Fetcher<FamousPayload, void> = async (_req, signal) => {
  const [metaRes, xrefsRes] = await Promise.all([
    fetch(dataUrl('famous_meta.json'), { signal }),
    fetch(dataUrl('famous_xrefs.json'), { signal }),
  ]);
  if (!metaRes.ok) throw new HttpError(metaRes.status, dataUrl('famous_meta.json'));
  if (!xrefsRes.ok) throw new HttpError(xrefsRes.status, dataUrl('famous_xrefs.json'));
  const [metaText, xrefsText] = await Promise.all([metaRes.text(), xrefsRes.text()]);
  return { meta: parseFamousMeta(metaText), xrefs: parseFamousXrefs(xrefsText) };
};

/**
 * famousMetaFetcher — fetches the famous-galaxy `famous_meta.json` sidecar
 * and returns a `{ meta }` payload.
 *
 * ### Why throw on 404 here, when the old loader returned empty?
 *
 * The old `loadFamousSidecars` swallowed 404s into empty values to keep
 * the engine running on developer clones without `npm run build-famous`.
 * The new design pushes that decision up: the slot subscriber maps
 * `kind: 'error'` → "feature off" by writing an empty array. Keeping
 * the fetcher honest about HTTP status lets the retry policy distinguish
 * "really gone" (404, give up) from "transient flake" (5xx, retry).
 */
import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { FamousMetaEntry } from '../../../@types/loading/FamousMetaEntry';
import type { FamousPayload } from '../../../@types/loading/FamousPayload';
import type { CompanionAssetReq } from '../../../@types/loading/CompanionAssetReq';
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

// The `tier` field on the request is ignored — famous_meta.json is a
// tier-agnostic resource. The uniform `CompanionAssetReq` shape lets
// `loadCompanionAssets` dispatch generically across every companion
// slot without a per-key switch.
export const famousMetaFetcher: Fetcher<FamousPayload, CompanionAssetReq> = async (
  _req,
  signal,
) => {
  const res = await fetch(dataUrl('famous_meta.json'), { signal });
  if (!res.ok) throw new HttpError(res.status, dataUrl('famous_meta.json'));
  const text = await res.text();
  return { meta: parseFamousMeta(text) };
};

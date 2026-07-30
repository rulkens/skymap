/**
 * famousGalaxiesMetaFetcher — fetches the famous-galaxy `famous_galaxies_meta.json` sidecar
 * and returns a `{ meta }` payload.
 *
 * ### Why throw on 404?
 *
 * The rejected alternative — swallow 404s into empty values so the
 * engine keeps running on developer clones without `npm run
 * build-famous` — belongs a layer up: the slot subscriber maps
 * `kind: 'error'` → "feature off" by writing an empty array. Keeping
 * the fetcher honest about HTTP status lets the retry policy distinguish
 * "really gone" (404, give up) from "transient flake" (5xx, retry).
 */
import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { FamousGalaxyMetaEntry } from '../../../@types/loading/FamousGalaxyMetaEntry';
import type { FamousGalaxiesPayload } from '../../../@types/loading/FamousGalaxiesPayload';
import type { CompanionAssetReq } from '../../../@types/loading/CompanionAssetReq';
import { HttpError, dataUrl } from '../fetchWithProgress';

/**
 * Parse `famous_galaxies_meta.json` content. Throws on schema mismatch. Public
 * to allow unit testing without hitting the network.
 */
export function parseFamousGalaxiesMeta(rawJson: string): FamousGalaxyMetaEntry[] {
  const parsed = JSON.parse(rawJson);
  if (!Array.isArray(parsed)) {
    throw new Error('famous_galaxies_meta.json: root must be an array');
  }
  return parsed as FamousGalaxyMetaEntry[];
}

// The `tier` field on the request is ignored — famous_galaxies_meta.json is a
// tier-agnostic resource. The uniform `CompanionAssetReq` shape lets
// `loadCompanionAssets` dispatch generically across every companion
// slot without a per-key switch.
export const famousGalaxiesMetaFetcher: Fetcher<FamousGalaxiesPayload, CompanionAssetReq> = async (
  _req,
  signal,
) => {
  const res = await fetch(dataUrl('famous_galaxies_meta.json'), { signal });
  if (!res.ok) throw new HttpError(res.status, dataUrl('famous_galaxies_meta.json'));
  const text = await res.text();
  return { meta: parseFamousGalaxiesMeta(text) };
};

/**
 * famousStarsMetaFetcher — fetches the famous-star `famous_stars_meta.json`
 * sidecar and returns a `{ meta }` payload.  The star twin of
 * `famousGalaxiesMetaFetcher`: the render-critical star row already loaded from the
 * catalog bin; these narrative/physical fields arrive lazily here for the
 * InfoCard.
 *
 * ### Why throw on 404?
 *
 * The rejected alternative — swallow 404s into empty values so the card
 * keeps working on developer clones without the build step that emits the
 * sidecar — belongs a layer up: the slot's subscriber maps a rejection →
 * "feature off" by reporting an empty array to the engine slice.
 * Keeping the fetcher honest about HTTP status lets any retry policy
 * distinguish "really gone" (404, give up) from "transient flake"
 * (5xx, retry).
 */
import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { FamousStarMetaEntry } from '../../../@types/loading/FamousStarMetaEntry';
import type { FamousStarsPayload } from '../../../@types/loading/FamousStarsPayload';
import { HttpError, dataUrl } from '../fetchWithProgress';

/**
 * Parse `famous_stars_meta.json` content. Throws on schema mismatch. Public
 * to allow unit testing without hitting the network.
 */
export function parseFamousStarsMeta(rawJson: string): FamousStarMetaEntry[] {
  const parsed = JSON.parse(rawJson);
  if (!Array.isArray(parsed)) {
    throw new Error('famous_stars_meta.json: root must be an array');
  }
  return parsed as FamousStarMetaEntry[];
}

// No parent slot and no tier: famous_stars_meta.json is a seeded catalog
// compiled into the bundle, so the request is always `undefined`.
export const famousStarsMetaFetcher: Fetcher<FamousStarsPayload, void> = async (_req, signal) => {
  const res = await fetch(dataUrl('famous_stars_meta.json'), { signal });
  if (!res.ok) throw new HttpError(res.status, dataUrl('famous_stars_meta.json'));
  const text = await res.text();
  return { meta: parseFamousStarsMeta(text) };
};

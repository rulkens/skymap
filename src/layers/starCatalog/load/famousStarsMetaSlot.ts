/**
 * famousStarsMetaSlot — factory for the famous-star meta sidecar.
 *
 * Carries `famous_stars_meta.json` through the standard asset-slot machinery,
 * the star twin of `createFamousGalaxiesMetaSlot`. No `commit` step: there's
 * nothing GPU-side to upload — the payload is pure metadata for the InfoCard,
 * published as a Layer fact rather than parked on a second copy.
 *
 * **Graceful degradation on error.** The fetcher throws on HTTP failure (so
 * the retry policy distinguishes "really gone" from "transient flake"), and
 * this subscriber maps `kind: 'error'` → "feature off" by publishing an empty
 * array. Net effect: the stars render without enriched InfoCard text, and the
 * engine keeps running.
 */

import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { famousStarsMetaFetcher } from './famousStarsMetaFetcher';
import type { FamousStarsPayload } from '../@types/FamousStarsPayload';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { LayerCoreDeps } from '../../../@types/engine/layer/LayerCoreDeps';
import type { StarCatalogFacts } from '../@types/StarCatalogFacts';

export function createFamousStarsMetaSlot(
  deps: Pick<LayerCoreDeps<StarCatalogFacts>, 'publish'>,
): AssetSlot<FamousStarsPayload, void> {
  const slot = createAssetSlot<FamousStarsPayload, void>({
    name: 'famous-stars-meta',
    fetch: famousStarsMetaFetcher,
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      deps.publish({ famousStarsMeta: s.value.meta });
    }
    if (s.kind === 'error') {
      // The facts bag already reads `?? []`, but publishing it again here is
      // explicit about the contract: a missing sidecar disables enriched
      // InfoCard text and keeps the engine functional.
      deps.publish({ famousStarsMeta: [] });
      console.warn('[engine] famous-stars sidecar failed to load:', s.error);
    }
  });
  return slot;
}

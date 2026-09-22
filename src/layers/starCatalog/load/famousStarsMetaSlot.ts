/**
 * famousStarsMetaSlot — factory for the famous-star meta sidecar, the star
 * twin of `createFamousGalaxiesMetaSlot`. No `commit`: the payload is pure
 * InfoCard metadata, published as a Layer fact. On a fetch error, publishes
 * an empty array rather than propagating — stars render without enriched
 * InfoCard text, and the engine keeps running.
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
      deps.publish({ famousStarsMeta: [] });
      console.warn('[engine] famous-stars sidecar failed to load:', s.error);
    }
  });
  return slot;
}

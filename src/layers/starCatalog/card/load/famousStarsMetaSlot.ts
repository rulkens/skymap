/**
 * famousStarsMetaSlot — factory for the famous-star meta sidecar, the star
 * twin of `createFamousGalaxiesMetaSlot`. No `commit`: the payload is pure
 * InfoCard metadata, which the selection row reads off `state()` when it
 * extracts a seeded star. A fetch error only warns: stars render without
 * enriched InfoCard text, and the engine keeps running.
 */

import { createAssetSlot } from '../../../../services/loading/AssetSlot';
import { famousStarsMetaFetcher } from './famousStarsMetaFetcher';
import type { FamousStarsPayload } from '../@types/FamousStarsPayload';
import type { AssetSlot } from '../../../../@types/loading/AssetSlot';

export function createFamousStarsMetaSlot(): AssetSlot<FamousStarsPayload, void> {
  const slot = createAssetSlot<FamousStarsPayload, void>({
    name: 'famous-stars-meta',
    fetch: famousStarsMetaFetcher,
  });
  slot.subscribe((s) => {
    if (s.kind === 'error') {
      console.warn('[engine] famous-stars sidecar failed to load:', s.error);
    }
  });
  return slot;
}

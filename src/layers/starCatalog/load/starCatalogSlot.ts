/**
 * starCatalogSlot — factory for one survey star-catalog's asset slot, reused
 * across every `starCatalog` registry row (parameterized by `source`).
 * Commit hands the decoded `StarOctree` to `renderer.upload`; unlike the
 * volume/galaxy layers there is no fade replay — the star layer's own
 * distance crossfade (registry `crossfadePc`) already covers that.
 */
import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { starCatalogFetcher } from './starCatalogFetcher';
import { SOURCE_REGISTRY } from '../../../data/sources';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { StarOctree } from '../../../@types/data/starCatalog/StarOctree';
import type { StarCatalogReq } from '../../../@types/loading/StarCatalogReq';
import type { SourceType } from '../../../@types/data/SourceType';
import type { StarCatalogRenderer } from '../@types/StarCatalogRenderer';

export function createStarCatalogSlot(
  source: SourceType,
  renderer: StarCatalogRenderer,
): AssetSlot<StarOctree, StarCatalogReq> {
  const id = SOURCE_REGISTRY[source].id;
  const slot = createAssetSlot<StarOctree, StarCatalogReq>({
    name: `starCatalog:${id}`,
    fetch: starCatalogFetcher,
    commit: async (octree) => {
      // Replaces any previous upload for this source — a tier reload
      // re-commits the new-resolution catalog.
      // No chunk slots yet: SKST has no chunks, and the tier's pool size arrives
      // with the octree format.
      renderer.upload(source, octree, 0);
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      console.log(
        `[engine] ${id}: ${s.value.starCount.toLocaleString()} stars, ` +
          `${s.value.nodes.count.toLocaleString()} nodes`,
      );
    }
  });
  return slot;
}

/**
 * starCatalogSlot — factory for one survey star-catalog's asset slot.
 *
 * ONE factory serves EVERY `starCatalog` row of the registry, parameterized
 * by `source` — the same reuse seam the fetcher (`starCatalogFetcher`) and the
 * request (`StarCatalogReq`) draw along their `source` dimension. `create`
 * builds `renderer` before minting any slot, so commit needs no null-guard.
 *
 * On commit, hands the decoded `StarCatalog` to `renderer.upload`, keyed by
 * the source code. The renderer commits the records blob to a per-source GPU
 * storage buffer once and keeps the octree CPU-side; the star layer walks
 * each committed catalog's octree per frame (`loadedCatalogs`). No fade
 * replay: unlike the volume/galaxy layers, the star layer owns its own
 * distance-crossfade band (registry `crossfadePc`) rather than the
 * intent → fade bridge, so the commit registers data and nothing else.
 */
import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { starCatalogFetcher } from './starCatalogFetcher';
import { SOURCE_REGISTRY } from '../../../data/sources';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { StarCatalog } from '../../../@types/data/starCatalog/StarCatalog';
import type { StarCatalogReq } from '../../../@types/loading/StarCatalogReq';
import type { SourceType } from '../../../@types/data/SourceType';
import type { LayerCoreDeps } from '../../../@types/engine/layer/LayerCoreDeps';
import type { StarCatalogRenderer } from '../@types/StarCatalogRenderer';

export function createStarCatalogSlot(
  source: SourceType,
  deps: Pick<LayerCoreDeps, 'reportSourceCount'>,
  renderer: StarCatalogRenderer,
): AssetSlot<StarCatalog, StarCatalogReq> {
  const id = SOURCE_REGISTRY[source].id;
  const slot = createAssetSlot<StarCatalog, StarCatalogReq>({
    name: `starCatalog:${id}`,
    fetch: starCatalogFetcher,
    commit: async (catalog) => {
      // Per-source records buffer committed once; the octree stays CPU-side for
      // the star layer to walk each frame. Replaces any previous upload for the
      // same source (a tier reload re-commits the new-resolution catalog).
      renderer.upload(source, catalog);
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      console.log(
        `[engine] ${id}: ${s.value.starCount.toLocaleString()} stars, ` +
          `${s.value.nodeCount.toLocaleString()} nodes`,
      );
      // Report the loaded star count so the SettingsPanel's per-catalog count
      // chip lights up and a tier reload re-reports the new tier's population.
      deps.reportSourceCount(source, s.value.starCount);
    }
  });
  return slot;
}

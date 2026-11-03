/**
 * starCatalogSlot — factory for one survey star-catalog's asset slot, reused
 * across every `starCatalog` registry row (parameterized by `source`).
 * Commit installs the decoded `Octree`'s chunk pool (`installStarPool`);
 * release drops the stream. Its row `gates` the star entry's item, so core fades the
 * catalog in on the commit; the registry `crossfadePc` band rides on top of that value.
 */
import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { starCatalogFetcher } from './starCatalogFetcher';
import { installStarPool } from './installStarPool';
import { STAR_CATALOG_SOURCE_RECORD } from '../sources/starCatalogSourceRecord';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { Octree } from '../../../@types/octree/Octree';
import type { StarCatalogReq } from '../@types/StarCatalogReq';
import type { StarCatalogSourceType } from '../@types/StarCatalogSourceType';
import type { OctreePoolHost } from '../../../@types/octree/OctreePoolHost';
import type { StarColumns } from '../@types/StarColumns';

export function createStarCatalogSlot(
  source: StarCatalogSourceType,
  host: OctreePoolHost<StarColumns>,
  chunkSlotsOverride: () => number | null,
): AssetSlot<Octree<StarColumns>, StarCatalogReq> {
  const entry = STAR_CATALOG_SOURCE_RECORD[source];
  if (entry.binBaseName === null) {
    throw new Error(`createStarCatalogSlot: source ${source} is not a streamed star catalog`);
  }
  const { id } = entry;
  const slot = createAssetSlot<Octree<StarColumns>, StarCatalogReq>({
    name: `starCatalog:${id}`,
    fetch: starCatalogFetcher,
    // The slot's race-check ran just before this call, so `lastRequest()` is
    // this commit's own request.
    commit: async (octree): Promise<void> =>
      installStarPool(host, source, octree, slot.lastRequest()!.tier, chunkSlotsOverride()),
    onRelease: () => {
      host.chunkStreams.get(source)?.destroy();
      host.chunkStreams.delete(source);
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      console.log(
        `[engine] ${id}: ${s.value.recordCount.toLocaleString()} stars, ` +
          `${s.value.nodes.count.toLocaleString()} nodes`,
      );
    }
  });
  return slot;
}

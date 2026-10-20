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
import { SOURCE_REGISTRY } from '../../../data/sources';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { Octree } from '../../../@types/octree/Octree';
import type { StarCatalogReq } from '../../../@types/loading/StarCatalogReq';
import type { SourceType } from '../../../@types/data/SourceType';
import type { OctreePoolHost } from '../../../@types/octree/OctreePoolHost';
import type { StarColumns } from '../../../@types/data/starCatalog/StarColumns';

export function createStarCatalogSlot(
  source: SourceType,
  host: OctreePoolHost<StarColumns>,
  chunkSlotsOverride: () => number | null,
): AssetSlot<Octree<StarColumns>, StarCatalogReq> {
  const entry = SOURCE_REGISTRY[source];
  if (entry.type !== 'starCatalog' || entry.binBaseName === null) {
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

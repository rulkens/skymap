/**
 * starCatalogSlot — factory for one survey star-catalog's asset slot, reused
 * across every `starCatalog` registry row (parameterized by `source`).
 * Commit installs the decoded `StarOctree`'s chunk pool (`installStarPool`);
 * release drops the stream. Its row `gates` the star entry's item, so core fades the
 * catalog in on the commit; the registry `crossfadePc` band rides on top of that value.
 */
import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { starCatalogFetcher } from './starCatalogFetcher';
import { installStarPool } from './installStarPool';
import { SOURCE_REGISTRY } from '../../../data/sources';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { StarOctree } from '../../../@types/data/starCatalog/StarOctree';
import type { StarCatalogReq } from '../../../@types/loading/StarCatalogReq';
import type { SourceType } from '../../../@types/data/SourceType';
import type { StarPoolHost } from '../@types/StarPoolHost';

export function createStarCatalogSlot(
  source: SourceType,
  host: StarPoolHost,
  chunkSlotsOverride: () => number | null,
): AssetSlot<StarOctree, StarCatalogReq> {
  const entry = SOURCE_REGISTRY[source];
  if (entry.type !== 'starCatalog' || entry.binBaseName === null) {
    throw new Error(`createStarCatalogSlot: source ${source} is not a streamed star catalog`);
  }
  const { id } = entry;
  const slot = createAssetSlot<StarOctree, StarCatalogReq>({
    name: `starCatalog:${id}`,
    fetch: starCatalogFetcher,
    // Replaces any previous upload for this source: a tier reload re-commits at the
    // new tier's pool size. The slot's race-check ran just before this call, so
    // `lastRequest()` is this commit's own request.
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
        `[engine] ${id}: ${s.value.starCount.toLocaleString()} stars, ` +
          `${s.value.nodes.count.toLocaleString()} nodes`,
      );
    }
  });
  return slot;
}

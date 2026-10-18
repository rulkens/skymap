/**
 * starCatalogSlot — factory for one survey star-catalog's asset slot, reused
 * across every `starCatalog` registry row (parameterized by `source`).
 * Commit installs the decoded `Octree`'s chunk pool (`installOctreePool`);
 * release drops the stream. Unlike the volume/galaxy layers there is no fade replay —
 * the star layer's own distance crossfade (registry `crossfadePc`) covers that.
 */
import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { starCatalogFetcher } from './starCatalogFetcher';
import { installOctreePool } from '../../../services/octree/installOctreePool';
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
    // Replaces any previous upload for this source: a tier reload re-commits at the
    // new tier's pool size. The slot's race-check ran just before this call, so
    // `lastRequest()` is this commit's own request.
    commit: async (octree): Promise<void> =>
      installOctreePool(host, source, octree, slot.lastRequest()!.tier, chunkSlotsOverride()),
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

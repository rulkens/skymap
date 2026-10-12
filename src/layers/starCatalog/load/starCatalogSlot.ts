/**
 * starCatalogSlot — factory for one survey star-catalog's asset slot, reused
 * across every `starCatalog` registry row (parameterized by `source`).
 * Commit hands the decoded `StarOctree` to `renderer.upload` and, when the
 * index names chunks, replaces the source's chunk stream in `chunkStreams`;
 * release drops it. Unlike the volume/galaxy layers there is no fade replay —
 * the star layer's own distance crossfade (registry `crossfadePc`) covers that.
 */
import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { starCatalogFetcher } from './starCatalogFetcher';
import { createStarChunkStream } from './starChunkStream';
import { SOURCE_REGISTRY } from '../../../data/sources';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { StarOctree } from '../../../@types/data/starCatalog/StarOctree';
import type { StarCatalogReq } from '../../../@types/loading/StarCatalogReq';
import type { SourceType } from '../../../@types/data/SourceType';
import type { StarCatalogRenderer } from '../@types/StarCatalogRenderer';
import type { StarChunkStream } from '../@types/StarChunkStream';

export function createStarCatalogSlot(
  source: SourceType,
  renderer: StarCatalogRenderer,
  chunkStreams: Map<SourceType, StarChunkStream>,
  requestRender: () => void,
): AssetSlot<StarOctree, StarCatalogReq> {
  const entry = SOURCE_REGISTRY[source];
  if (entry.type !== 'starCatalog' || entry.binBaseName === null) {
    throw new Error(`createStarCatalogSlot: source ${source} is not a streamed star catalog`);
  }
  const { id, binBaseName } = entry;
  const dropStream = () => {
    chunkStreams.get(source)?.destroy();
    chunkStreams.delete(source);
  };
  const slot = createAssetSlot<StarOctree, StarCatalogReq>({
    name: `starCatalog:${id}`,
    fetch: starCatalogFetcher,
    commit: async (octree) => {
      // Replaces any previous upload for this source — a tier reload
      // re-commits at the new tier's pool size. The slot's race-check ran just
      // before this call, so `lastRequest()` is this commit's own request.
      const tier = slot.lastRequest()!.tier;
      // Upload first: a pool past its caps throws here and leaves the old stream valid.
      const slots = renderer.upload(source, octree, entry.budgets[tier].slots);
      dropStream();
      if (slots === 0) return;
      chunkStreams.set(
        source,
        createStarChunkStream({
          octree,
          binBaseName,
          slots,
          requestRender,
          upload: (s, chunk, host) => renderer.uploadChunk(source, s, chunk, host),
          evict: (s, host) => renderer.evictChunk(source, s, host),
        }),
      );
    },
    onRelease: dropStream,
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

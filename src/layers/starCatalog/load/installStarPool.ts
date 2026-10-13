/**
 * installStarPool — gives a source's loaded octree its chunk pool: uploads the
 * index at the pool size, then replaces the source's chunk stream. Shared by a
 * slot commit (a fresh load) and a resize (the same octree, no refetch).
 * `upload` runs first and throws past the pool caps, so a failure leaves the
 * previous stream drawing.
 */
import { SOURCE_REGISTRY } from '../../../data/sources';
import { createStarChunkStream } from './starChunkStream';
import type { StarOctree } from '../../../@types/data/starCatalog/StarOctree';
import type { SourceType } from '../../../@types/data/SourceType';
import type { Tier } from '../../../@types/data/Tier';
import type { StarPoolHost } from '../@types/StarPoolHost';

export function installStarPool(
  host: StarPoolHost,
  source: SourceType,
  octree: StarOctree,
  tier: Tier,
  slotsOverride: number | null,
): void {
  const entry = SOURCE_REGISTRY[source];
  if (entry.type !== 'starCatalog' || entry.binBaseName === null) {
    throw new Error(`installStarPool: source ${source} is not a streamed star catalog`);
  }
  const { renderer, chunkStreams, requestRender } = host;
  const slots = renderer.upload(source, octree, slotsOverride ?? entry.budgets[tier].slots);
  chunkStreams.get(source)?.destroy();
  chunkStreams.delete(source);
  if (slots === 0) return;
  chunkStreams.set(
    source,
    createStarChunkStream({
      octree,
      binBaseName: entry.binBaseName,
      slots,
      requestRender,
      upload: (s, chunk, h) => renderer.uploadChunk(source, s, chunk, h),
      evict: (s, h) => renderer.evictChunk(source, s, h),
    }),
  );
}

/**
 * installOctreePool — gives a source's loaded octree its chunk pool: uploads the
 * index at the pool size, then replaces the source's chunk stream. Shared by a
 * slot commit (a fresh load) and a resize (the same octree, no refetch).
 * `upload` runs first and throws past the pool caps, so a failure leaves the
 * previous stream drawing.
 */
import { SOURCE_REGISTRY } from '../../data/sources';
import { createOctreeChunkStream } from './octreeChunkStream';
import type { Octree } from '../../@types/octree/Octree';
import type { SourceType } from '../../@types/data/SourceType';
import type { Tier } from '../../@types/data/Tier';
import type { StarColumns } from '../../@types/data/starCatalog/StarColumns';
import type { OctreePoolHost } from '../../@types/octree/OctreePoolHost';

export function installOctreePool(
  host: OctreePoolHost<StarColumns>,
  source: SourceType,
  octree: Octree<StarColumns>,
  tier: Tier,
  slotsOverride: number | null,
): void {
  const entry = SOURCE_REGISTRY[source];
  if (entry.type !== 'starCatalog' || entry.binBaseName === null) {
    throw new Error(`installOctreePool: source ${source} is not a streamed star catalog`);
  }
  const { renderer, chunkStreams, requestRender } = host;
  const slots = renderer.upload(source, octree, slotsOverride ?? entry.budgets[tier].slots);
  chunkStreams.get(source)?.destroy();
  chunkStreams.delete(source);
  if (slots === 0) return;
  chunkStreams.set(
    source,
    createOctreeChunkStream({
      octree,
      binBaseName: entry.binBaseName,
      slots,
      requestRender,
      upload: (s, chunk, h) => renderer.uploadChunk(source, s, chunk, h),
      evict: (s, h) => renderer.evictChunk(source, s, h),
    }),
  );
}

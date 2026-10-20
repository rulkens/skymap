/**
 * installOctreePool — gives a source's loaded octree its chunk pool: uploads the
 * index at the pool size, then replaces the source's chunk stream. Shared by a
 * slot commit (a fresh load) and a resize (the same octree, no refetch).
 * `upload` runs first and throws past the pool caps, so a failure leaves the
 * previous stream drawing.
 */
import { createOctreeChunkStream } from './octreeChunkStream';
import type { Octree } from '../../@types/octree/Octree';
import type { SourceType } from '../../@types/data/SourceType';
import type { OctreePoolHost } from '../../@types/octree/OctreePoolHost';
import type { OctreeStreamFormat } from '../../@types/octree/OctreeStreamFormat';

export function installOctreePool<C extends { readonly count: number }>(
  host: OctreePoolHost<C>,
  source: SourceType,
  octree: Octree<C>,
  slots: number,
  format: OctreeStreamFormat<C>,
): void {
  const { renderer, chunkStreams, requestRender } = host;
  const poolSlots = renderer.upload(source, octree, slots);
  chunkStreams.get(source)?.destroy();
  chunkStreams.delete(source);
  if (poolSlots === 0) return;
  chunkStreams.set(
    source,
    createOctreeChunkStream({
      octree,
      format,
      slots: poolSlots,
      requestRender,
      upload: (s, chunk, h) => renderer.uploadChunk(source, s, chunk, h),
      evict: (s, h) => renderer.evictChunk(source, s, h),
    }),
  );
}

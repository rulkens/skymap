import type { SourceType } from '../../@types/data/SourceType';
import type { OctreeChunkStream } from '../../@types/octree/OctreeChunkStream';
import type { OctreeResidency } from '../../@types/octree/OctreeResidency';

/** A source's resident chunks, looked up per call: a tier reload replaces the stream. */
export function octreeResidency<C extends { readonly count: number }>(
  chunkStreams: ReadonlyMap<SourceType, OctreeChunkStream<C>>,
  source: SourceType,
): OctreeResidency<C> {
  return {
    chunk: (id) => chunkStreams.get(source)?.resident(id) ?? null,
    chunkOfRecord: (ordinal) => chunkStreams.get(source)?.residentOfRecord(ordinal) ?? null,
  };
}

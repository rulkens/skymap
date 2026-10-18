import type { OctreeChunk } from '../../src/@types/octree/OctreeChunk';
import type { OctreeResidency } from '../../src/@types/octree/OctreeResidency';
import type { StarColumns } from '../../src/@types/data/starCatalog/StarColumns';

/** A residency holding exactly `chunks`, looked up as the chunk stream does; none: a v1 catalog. */
export function residencyOf(...chunks: readonly OctreeChunk<StarColumns>[]): OctreeResidency<StarColumns> {
  return {
    chunk: (id) => chunks.find((c) => c.ref.id === id) ?? null,
    chunkOfRecord: (ordinal) =>
      chunks.find((c) => ordinal >= c.ref.recordBase && ordinal < c.ref.recordBase + c.ref.records) ??
      null,
  };
}

import type { StarChunk } from '../../src/@types/data/starCatalog/StarChunk';
import type { StarResidency } from '../../src/@types/data/starCatalog/StarResidency';

/** A residency holding exactly `chunks`, looked up as the chunk stream does; none: a v1 catalog. */
export function residencyOf(...chunks: readonly StarChunk[]): StarResidency {
  return {
    chunk: (id) => chunks.find((c) => c.ref.id === id) ?? null,
    chunkOfRecord: (ordinal) =>
      chunks.find((c) => ordinal >= c.ref.recordBase && ordinal < c.ref.recordBase + c.ref.records) ??
      null,
  };
}

import type { OctreeChunk } from './OctreeChunk';

/** A source's resident chunks' CPU copies, or null when no slot holds the one asked for. */
export type OctreeResidency<C extends { readonly count: number }> = {
  /** By catalog-global chunk id. */
  readonly chunk: (id: number) => OctreeChunk<C> | null;
  /** The chunk whose records hold a catalog-global record ordinal. */
  readonly chunkOfRecord: (ordinal: number) => OctreeChunk<C> | null;
};

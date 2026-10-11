import type { StarChunk } from './StarChunk';

/** A source's resident chunks' CPU copies, or null when no slot holds the one asked for. */
export type StarResidency = {
  /** By catalog-global chunk id. */
  readonly chunk: (id: number) => StarChunk | null;
  /** The chunk whose records hold a catalog-global record ordinal. */
  readonly chunkOfRecord: (ordinal: number) => StarChunk | null;
};

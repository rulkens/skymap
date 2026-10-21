import type { OctreeChunk } from './OctreeChunk';

/** A resident chunk as its pool slot holds it: the chunk, and where its records start. */
export type OctreeSlotRun<C extends { readonly count: number }> = {
  readonly chunk: OctreeChunk<C>;
  /** Pool-absolute index of the chunk's first record: the index's records come first. */
  readonly poolBase: number;
};

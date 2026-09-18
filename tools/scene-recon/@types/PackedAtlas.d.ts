import type { PackedVertex } from './PackedVertex';

/** xatlas's output mesh: the re-indexed vertex/triangle buffers a pack produces for one atlas. */
export type PackedAtlas = {
  readonly chartCount: number;
  readonly vertices: readonly PackedVertex[];
  readonly indices: Uint32Array; // 3 per triangle, into `vertices`
};

import type { SurfaceTileArchiveIndex } from '../../../../src/layers/body/surfaceTiles/archive/@types/SurfaceTileArchiveIndex';

/** HeightArchiveLevel — one height level's decoded `.idx` and the pack part file descriptors opened so far. */
export type HeightArchiveLevel = {
  readonly index: SurfaceTileArchiveIndex;
  readonly fds: Map<number, number>;
};

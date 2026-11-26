import type { SurfaceTileArchiveIndex } from '../../../../src/@types/archive/ArchiveIndex';

/** HeightArchiveLevel — one height level's decoded `.idx` and the pack part file descriptors opened so far. */
export type HeightArchiveLevel = {
  readonly index: SurfaceTileArchiveIndex;
  readonly fds: Map<number, number>;
};

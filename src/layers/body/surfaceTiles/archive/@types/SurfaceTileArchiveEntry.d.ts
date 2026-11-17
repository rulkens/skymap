/** SurfaceTileArchiveEntry — where one tile's bytes sit: `length` bytes at
 *  `offset` inside part `part` of the level's pack. `key` is the Morton key. */
export type SurfaceTileArchiveEntry = {
  readonly key: number;
  readonly part: number;
  readonly offset: number;
  readonly length: number;
};

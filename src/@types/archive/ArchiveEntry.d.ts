/** ArchiveEntry — where one entry's bytes sit: `length` bytes at `offset` inside part `part`
 *  of the archive's pack. `key` is the caller's: a surface tile's Morton key, a volume brick's `brickId`. */
export type ArchiveEntry = {
  readonly key: number;
  readonly part: number;
  readonly offset: number;
  readonly length: number;
};

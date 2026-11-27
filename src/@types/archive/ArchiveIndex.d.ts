/** ArchiveIndex — a decoded `.idx`: counts from the header and the
 *  raw bytes, so lookups read entries in place instead of materialising them. */
export type ArchiveIndex = {
  readonly partCount: number;
  readonly entryCount: number;
  readonly view: DataView;
};

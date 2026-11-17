/** The pick ribbons' instance records, one per centreline segment, grouped by stream in meta order. */
export type StellarStreamRibbons = {
  /** `STELLAR_STREAM_RIBBON_RECORD_LANES` lanes per segment. */
  readonly records: ArrayBuffer;
  /** Per stream, its first segment and segment count: what a draw of that stream alone covers. */
  readonly ranges: readonly { readonly first: number; readonly count: number }[];
};

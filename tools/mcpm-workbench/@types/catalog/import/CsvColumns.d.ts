/**
 * CsvColumns — a CSV's first four columns as read, before any import setting
 * applies, so a changed setting re-derives the catalog without reading the text
 * again. Float64, not Float32: the RA/Dec range tests, the redshift distance and
 * the weight scale all ran on the double `Number()` gave, and rounding first
 * would load a Dec of 90.000001 and shift stored values by one float32 step.
 */
export type CsvColumns = {
  /** Four values per row, interleaved: x, y, z, weight or RA, Dec, redshift, weight. */
  readonly values: Float64Array;
  /** Each row's 1-based line in the file, for messages. */
  readonly lines: Uint32Array;
  readonly count: number;
  /** The first problem the text alone shows ("Line N: …"); no row after it was read. */
  readonly problem: string | null;
  /**
   * The first row whose weight, read as log₁₀ mass, overflows a 32-bit float,
   * with the weight as written: that refusal quotes the file, not the number.
   */
  readonly firstLogOverflow: { readonly row: number; readonly text: string } | null;
};

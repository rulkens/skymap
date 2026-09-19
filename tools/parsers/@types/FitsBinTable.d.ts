import type { FitsColumn } from './FitsColumn';

/** A FITS BINTABLE extension's layout: where the rows are, and what a row holds. */
export type FitsBinTable = {
  /** Absolute byte offset of the first data row within the buffer. */
  dataOffset: number;
  /** NAXIS1 of the BINTABLE extension — bytes per row. */
  rowLengthBytes: number;
  /** NAXIS2 of the BINTABLE extension — number of rows. */
  rowCount: number;
  /** TFIELDS entries, in TTYPEn/TFORMn order. */
  columns: readonly FitsColumn[];
};

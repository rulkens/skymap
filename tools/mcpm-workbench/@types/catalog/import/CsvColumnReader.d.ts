import type { CsvColumns } from './CsvColumns';

/**
 * CsvColumnReader — reads a CSV's UTF-8 bytes in chunks as they stream in, so a
 * large file is never held whole. `push` returns false once a problem ends the read.
 */
export type CsvColumnReader = {
  readonly push: (chunk: Uint8Array) => boolean;
  readonly finish: () => CsvColumns;
};

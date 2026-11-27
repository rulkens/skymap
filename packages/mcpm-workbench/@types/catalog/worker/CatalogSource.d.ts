import type { CsvColumns } from '../import/CsvColumns';

/**
 * CatalogSource — the chosen files as the catalog worker holds them between
 * requests: a CSV already read into its columns, or a packed pair as read, so a
 * changed import setting derives again without touching the disk.
 */
export type CatalogSource =
  | { readonly kind: 'csv'; readonly fileName: string; readonly columns: CsvColumns }
  | {
      readonly kind: 'packed';
      readonly fileName: string;
      readonly bin: ArrayBuffer;
      readonly metadataText: string;
    };

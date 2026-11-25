/**
 * CatalogContents — the chosen files read into memory once, so a changed
 * import setting parses again without reading the disk again.
 */
export type CatalogContents =
  | { readonly kind: 'csv'; readonly fileName: string; readonly text: string }
  | {
      readonly kind: 'packed';
      readonly fileName: string;
      readonly bin: ArrayBuffer;
      readonly metadataText: string;
    };

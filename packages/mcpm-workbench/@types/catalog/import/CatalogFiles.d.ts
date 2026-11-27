/** CatalogFiles — what a visitor chose: one .csv (or .tsv, .txt, .dat), or a `.bin` with its metadata. */
export type CatalogFiles =
  | { readonly kind: 'csv'; readonly file: File }
  | { readonly kind: 'packed'; readonly bin: File; readonly metadata: File };

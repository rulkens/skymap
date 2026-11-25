/** CatalogFiles — the files a visitor chose to load: one text table, or a packed `.bin` with its metadata. */
export type CatalogFiles =
  | { readonly kind: 'csv'; readonly file: File }
  | { readonly kind: 'packed'; readonly bin: File; readonly metadata: File };

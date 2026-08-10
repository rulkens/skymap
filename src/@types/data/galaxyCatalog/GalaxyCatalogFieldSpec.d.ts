/**
 * One `GalaxyCatalogColumn`'s in-memory element type plus its place in the
 * per-record on-disk layout — see `GALAXY_CATALOG_FIELD_SPECS` in
 * `data/galaxyCatalog/galaxyCatalogFormat.ts`, the single declaration of the
 * v8 record layout. `disk.kind` is a one-member union today; a future format
 * revision adds a `'flagBit'` member for sub-byte packed flags — the shape
 * is kept so that lands as a union growth, not a rewrite.
 */
export type GalaxyCatalogFieldSpec = {
  readonly column: 'u64' | 'f32' | 'u8';
  readonly components: 1 | 3;
  readonly disk: { readonly kind: 'field'; readonly offset: number };
};

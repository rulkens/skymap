/**
 * One `GalaxyCatalogColumn`'s in-memory element type plus its place in the
 * per-record on-disk layout — see `GALAXY_CATALOG_FIELD_SPECS` in
 * `data/galaxyCatalog/galaxyCatalogFormat.ts`, the single declaration of the
 * v9 record layout. `'flagBit'` packs a `Uint8Array` column into one bit of
 * a shared flags byte (`offset` is that byte's record offset, `bit` its
 * index); `'field'` covers everything with its own byte range.
 */
export type GalaxyCatalogFieldSpec = {
  readonly column: 'u64' | 'f32' | 'u8';
  readonly components: 1 | 3;
  readonly disk:
    | { readonly kind: 'field'; readonly offset: number }
    | { readonly kind: 'flagBit'; readonly offset: number; readonly bit: number };
};

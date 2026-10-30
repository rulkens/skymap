/**
 * BandLabels — the band-label record returned by
 * the galaxyCatalog Layer's `sources/` rows.  Kept as a named type so InfoCard
 * prop types can refer to it directly without needing to spell out the
 * structure at every call site.
 *
 * The per-source mapping (which photometric band lives in each slot)
 * lives in the each source entry's `bandLabels` in `APP_SOURCE_REGISTRY`;
 * this type only describes the slot-keyed shape.
 */
export type BandLabels = {
  u: string;
  g: string;
  r: string;
  i: string;
  z: string;
};

/**
 * BandLabels — the band-label record returned by
 * `src/data/sources.ts:bandLabels()`.  Kept as a named type so InfoCard
 * prop types can refer to it directly without needing to spell out the
 * structure at every call site.
 *
 * The per-source mapping (which photometric band lives in each slot)
 * lives in the runtime `BAND_LABELS` table in `src/data/sources.ts`;
 * this type only describes the slot-keyed shape.
 */
export type BandLabels = {
  u: string;
  g: string;
  r: string;
  i: string;
  z: string;
};

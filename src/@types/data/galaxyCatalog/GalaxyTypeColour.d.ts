/**
 * The colour index a catalog's galaxy-type tag reads: `slotA` minus `slotB` (five-band slots, so
 * the bands are whatever `bandLabels` says they carry), judged on the thresholds calibrated for
 * the named colour. The tag is a coarse red-vs-blue hint, so near-enough thresholds are fine.
 */
export type GalaxyTypeColour = {
  readonly slotA: 'u' | 'g' | 'r' | 'i' | 'z';
  readonly slotB: 'u' | 'g' | 'r' | 'i' | 'z';
  readonly thresholds: 'u-r' | 'B-J' | 'J-K';
};

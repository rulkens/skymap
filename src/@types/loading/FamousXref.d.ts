/** One cross-match record. `null` means "no match within MATCH_THRESHOLD_ARCSEC". */
export type FamousXref = {
  source: 'TwoMRS' | 'Glade';
  localIdx: number;
  distanceArcsec: number;
};

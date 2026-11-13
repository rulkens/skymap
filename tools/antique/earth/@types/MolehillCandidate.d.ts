/** A crest post that may become a molehill at one level, with its greedy rank. */
export type MolehillCandidate = {
  readonly lonDeg: number;
  readonly latDeg: number;
  readonly score: number;
  readonly importance: number;
};

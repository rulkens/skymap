/** A placed molehill: its crest, the reveal level it joins at, and how mountainous
 * its surroundings are (0..1, sets the drawn size). */
export type Molehill = {
  readonly lonDeg: number;
  readonly latDeg: number;
  readonly level: number;
  readonly importance: number;
};

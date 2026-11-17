/** A province inside a 1690 realm (`PROVINCES_1690`): bounded by rank-3 dotted
 * borders, washed in its realm's pigment. */
export type Province1690 = {
  readonly key: string;
  readonly realm: string;
  readonly name: string;
  readonly modern: string;
  readonly coastalBandKm?: number;
};

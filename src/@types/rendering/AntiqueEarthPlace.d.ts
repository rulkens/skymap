/**
 * One name the antique look sets on Earth's globe (`ANTIQUE_EARTH_PLACES`): a land
 * in spaced capitals or a sea in italic, centred on its anchor. `name` is the
 * period Latin; a `\n` stacks its words, as a globe maker fitted a long name.
 */

export type AntiqueEarthPlace = {
  /** Label id, unique across every producer. */
  readonly id: string;
  readonly name: string;
  readonly kind: 'land' | 'sea';
  /** Geodetic latitude, degrees. */
  readonly latDeg: number;
  /** EAST-positive longitude, degrees (`surfacePointBodyFixed`'s convention). */
  readonly lonDeg: number;
};

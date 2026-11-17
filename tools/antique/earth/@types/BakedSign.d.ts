/** One sign of the antique Earth map (a town, a molehill), geodetic degrees. */
export type BakedSign = {
  readonly lonDeg: number;
  readonly latDeg: number;
  readonly sizeUnits: number;
  readonly kind: number;
  readonly level: number;
  /** The level it fades out over (until..until + 1); absent: never. */
  readonly untilLevel?: number;
};

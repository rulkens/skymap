/** One rung of the distance ladder: an Mpc value restated in that rung's unit. */
export type DistanceRung = {
  readonly value: number;
  readonly unit: 'Gpc' | 'Mpc' | 'kpc' | 'pc' | 'AU' | 'km' | 'm';
  /** The light-year unit of the same decade; parsec family only. */
  readonly lyUnit?: 'Gly' | 'Mly' | 'kly' | 'ly';
};

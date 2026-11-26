/** AsteroidMeasuredSize — one asteroid's row of `asteroid-diameters.bin`: km, and the geometric albedo where measured. */
export type AsteroidMeasuredSize = {
  readonly diameterKm: number;
  readonly albedo: number | null;
};

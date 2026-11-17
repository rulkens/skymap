/** AsteroidDiameterRow — one SBDB measurement: diameter in km, geometric albedo or null where SBDB has none. */
export type AsteroidDiameterRow = {
  readonly number: number;
  readonly diameterKm: number;
  readonly albedo: number | null;
};

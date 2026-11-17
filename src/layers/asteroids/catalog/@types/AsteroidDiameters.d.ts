/**
 * AsteroidDiameters — `asteroid-diameters.bin` as views onto the fetched buffer (layout in
 * `tools/utils/io/writeAsteroidDiameters.ts`): `numbers` ascending, entry j measured `diameterKm[j]`,
 * albedo `albedo[j]` (NaN where none).
 */
export type AsteroidDiameters = {
  readonly numbers: Uint32Array;
  readonly diameterKm: Float32Array;
  readonly albedo: Float32Array;
};

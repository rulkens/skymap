/**
 * GalaxySfMapDustCdf — `buildSfMapDustCdf`'s output: a prefix sum of
 * `sfMapDustDensity x texelArea` over every (ring, az) texel of a
 * `GalaxySfMap`, flattened `ring*az + azIdx` to match `GalaxySfMap.data`'s
 * own row-major layout. `sampleSfMapDustCdf` binary-searches `prefix` to
 * place particles exactly proportional to the map's density — see
 * docs/research/m74-jwst/07-sprite-seeding.md S1.
 */
export type GalaxySfMapDustCdf = {
  readonly az: number;
  readonly rings: number;
  readonly rMin: number;
  readonly rMax: number;
  /** Cumulative mass through texel `i` inclusive; `prefix[prefix.length-1] === total`. */
  readonly prefix: Float32Array;
  readonly total: number;
};

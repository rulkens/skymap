/**
 * `GalaxyFieldProbe.requestArmSpurCloudPlacementReadback` and
 * `.requestArmCloudPlacementReadback`'s resolved shape — identical for both.
 */
export type GalaxyFieldCloudPlacementReadback = {
  readonly count: number;
  readonly offset: number;
  readonly flux: number;
  readonly records: Float32Array;
  readonly fluxWeight: Float32Array;
  readonly renormScale: number;
};

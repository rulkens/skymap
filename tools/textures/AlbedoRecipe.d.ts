/** The one flat, versioned object the albedo bench tunes and the bake reads
 *  (design §7): a fixed step order, not a stage list, so the bench and the
 *  bake can never drift into applying steps in a different sequence. */
export type AlbedoRecipe = {
  readonly version: 1;
  readonly sunFit: {
    readonly windowKm: number;
    readonly strideKm: number;
    readonly highPassKm: number;
    readonly minConfidence: number;
    readonly fillSigmaKm: number;
  };
  /** divide by `max(minShading, 1 + strength·g·s)` */
  readonly deshade: { readonly strength: number; readonly minShading: number };
  /** linear luminance */
  readonly knee: { readonly threshold: number; readonly softness: number };
  readonly ice: {
    readonly minAbsLatDeg: number;
    readonly fadeDeg: number;
    readonly minWhiteness: number;
    readonly minLuminance: number;
  };
  readonly grade: {
    readonly exposureEv: number;
    readonly gain: readonly [number, number, number];
    readonly offset: readonly [number, number, number];
    readonly contrast: number;
    readonly saturation: number;
    readonly gamma: number;
  };
};

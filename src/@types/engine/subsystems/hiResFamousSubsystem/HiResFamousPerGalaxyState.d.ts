export type HiResFamousPerGalaxyState = {
  /** Layer index in the hi-res `texture_2d_array`, or -1 if no slot is allocated. */
  readonly hiResLayerIdx: number;
  /** Smoothstep alpha in [0, 1] across the 200 → 260 px crossfade band. */
  readonly hiResCrossfadeAlpha: number;
};

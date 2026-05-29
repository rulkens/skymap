/**
 * DiskInstance — per-instance CPU-side shape for the TexturedDiskRenderer.
 *
 * Per-instance attributes (48 bytes / 12 floats):
 *
 *   posSize       vec4   xyz, sizeWorld
 *   uvRect        vec4   u0, v0, u1, v1
 *   orientation   vec4   axisRatio, positionAngleDeg, fadeAlpha, _
 *
 * Note: `fadeAlpha` lives in the third slot of the orientation vec4, NOT
 * in a fourth `extras` vec4 like ThumbnailInstance. Keeping the layout to
 * three vec4s (48 bytes total) matches ThumbnailInstance + ProceduralDiskInstance.
 */
export type DiskInstance = {
  x: number;
  y: number;
  z: number;
  sizeWorld: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  axisRatio: number;
  positionAngleDeg: number;
  /**
   * Per-frame fade multiplier in [0, 1]. Distance fade × load fade,
   * computed CPU-side by the engine and folded into the shader's final
   * alpha output. See ThumbnailInstance.d.ts for the underlying logic.
   */
  fadeAlpha: number;
  /**
   * Index into the per-tier hi-res layered atlas (one of HI_RES_LAYER_COUNT
   * slots). Sentinel −1 means "no hi-res slot assigned" — a negative
   * sentinel keeps the field a plain `number` that packs into a
   * Float32Array without branching.
   */
  hiResLayerIdx: number;
  /**
   * Crossfade ramp in [0, 1] from atlas thumbnail to hi-res layer slot.
   * 0 = fully low-res, 1 = fully hi-res. Bounded so the shader can `mix`
   * without clamping.
   */
  hiResCrossfadeAlpha: number;
};

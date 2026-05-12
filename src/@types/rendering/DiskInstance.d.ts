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
};

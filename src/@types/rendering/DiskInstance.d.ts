import type { Vec2 } from '../math/Vec2';

/**
 * DiskInstance — per-instance CPU-side shape for the TexturedDiskRenderer.
 *
 * Per-instance attributes (64 bytes / 16 floats — four vec4 slots):
 *
 *   posSize       vec4   xyz, sizeWorld
 *   uvRect        vec4   u0, v0, u1, v1
 *   orientation   vec4   axisRatio, positionAngleDeg, fadeAlpha, _
 *   hiResSlot     vec4   hiResLayerIdx, hiResCrossfadeAlpha, nucleusOffset.x, nucleusOffset.y
 *
 * Note: `fadeAlpha` lives in the third slot of the orientation vec4, NOT
 * in a fourth `extras` vec4 like ThumbnailInstance. The fourth vec4's .z/.w
 * (floats 14, 15) carry the calibrated nucleus offset (local corner frame).
 * The shared stride (with ProceduralDiskInstance) stays 64 bytes / 16 floats.
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
  /**
   * Nucleus position in the disk's LOCAL corner frame ([-1, +1]²);
   * [0, 0] = centred (the uncalibrated default). The vertex shader
   * subtracts it from each corner so a calibrated galaxy's nucleus lands
   * on the catalog 3-D point, using its own (major, minor) basis — no
   * CPU-side world basis to reconstruct. See `nucleusCorner` in
   * `famousPlacement.ts`.
   */
  nucleusOffset: Vec2;
};

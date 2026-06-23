/**
 * packPointUniforms — pure packer for the 208-byte `Uniforms` struct.
 *
 * Single source of truth for the visual-pass byte layout.  Both the point
 * renderer's `draw()` and (via the returned buffer) the pick renderer's
 * per-frame snapshot call this function so their packing never drifts.
 *
 * Why a separate module rather than an inner function in `pointRenderer.ts`?
 * The pick renderer needs to pack a fresh buffer *without* touching the
 * visual pass's uploaded copy — passing the buffer back from `draw()` lets
 * the pick renderer start from the correctly-packed visual state and apply
 * its three overrides (selectedPacked sentinel, padded pointSizePx,
 * pickPass = 1) without a race.  A top-level function satisfies that
 * contract while remaining testable without any GPU device.
 *
 * `pickPass` is always packed as 0 here (visual pass).  The pick renderer
 * applies its overrides after uploading this buffer — see `pickRenderer.ts`.
 *
 * Byte layout: see `UNIFORM_BYTES` docblock in `pointRenderer.ts`.
 *
 * @module
 */

import type { mat4 } from 'gl-matrix';
import type { PointDrawSettings } from '../../@types/rendering/PointDrawSettings';

/**
 * Byte size of the `Uniforms` struct as seen by the GPU.  The single
 * source of truth for the alloc in `packPointUniforms` and for any consumer
 * that needs to know the buffer size up front (e.g. the pick renderer).
 * `pointRenderer.ts` re-exports this so existing call-sites that already
 * import from `pointRenderer` don't need a new import path.
 *
 * 208 = (16 + 4 + 4 + 4 + 4 + 8 + 4 + 8) × 4 bytes.  The trailing 8 words are
 * the gravitational-lensing block (bytes 176..207).  See the `UNIFORM_BYTES`
 * docblock in `pointRenderer.ts` for the full slot-by-slot layout.
 */
export const UNIFORM_BYTES = 16 * 4 + 4 * 4 + 4 * 4 + 4 * 4 + 4 * 4 + 8 * 4 + 4 * 4 + 8 * 4; // 208 bytes

/**
 * Allocate and pack a `Uniforms` buffer for the visual point-sprite pass.
 *
 * `viewProj` and `viewportPx` mirror the positional args `PointRenderer.draw`
 * already receives; `settings` carries every per-frame knob.  The pick
 * renderer may call this independently (after `draw` returns the buffer) to
 * produce a clean starting point for its three-field override.
 */
export function packPointUniforms(
  viewProj: mat4,
  viewportPx: readonly [number, number],
  settings: PointDrawSettings,
): ArrayBuffer {
  const {
    pointSizePx,
    brightness,
    selectedPacked,
    camPosWorld,
    pxPerRad,
    highlightFallback,
    realOnlyMode,
    biasMode,
    absMagLimit,
    depthFadeEnabled,
    pxFadeStart,
    pxFadeEnd,
    lensEnabled,
    lensCenterWorld,
    lensThetaERad,
  } = settings;

  // Pad slots are zero-initialised by `new ArrayBuffer` and never written.
  const buf = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(buf);
  const u32 = new Uint32Array(buf);

  // CameraUniforms prefix (bytes 0..79).
  f32.set(viewProj, 0);
  f32[16] = viewportPx[0]; // viewportPx.x  byte 64
  f32[17] = viewportPx[1]; // viewportPx.y  byte 68
  // f32[18..19] cam._pad0/1 stay zero.

  u32[20] = selectedPacked >>> 0; // byte 80  selectedPacked (u32)
  // u32[21] (byte 84) sourceCode — written per-source in the draw loop, not here.
  f32[22] = pointSizePx; // byte 88
  f32[23] = brightness; // byte 92
  f32[24] = camPosWorld[0]; // byte 96
  f32[25] = camPosWorld[1]; // byte 100
  f32[26] = camPosWorld[2]; // byte 104
  f32[27] = pxPerRad; // byte 108
  u32[28] = highlightFallback ? 1 : 0; // byte 112
  u32[29] = realOnlyMode ? 1 : 0; // byte 116
  u32[30] = depthFadeEnabled ? 1 : 0; // byte 120
  // u32[31] _pad4 stays zero.

  // Malmquist-bias state.  Mode through u32, threshold through f32 — both
  // alias the same ArrayBuffer.
  u32[32] = biasMode >>> 0; // byte 128
  f32[33] = absMagLimit; // byte 132
  // f32[34..38] (apparentMagLimit / schechterMStar / schechterAlpha /
  // schechterMLim / schechterNRef) + u32[39] (_pad5) stay zero.  The
  // Schechter / 1-over-Vmax modes read their per-galaxy weights from the
  // per-vertex `schechterRatio` + angular slots (spliced in by
  // `biasCorrectionSubsystem`), so these uniform slots carry nothing —
  // left reserved rather than removed to keep the struct's byte offsets
  // (incl. `pickPass`) stable.

  // Procedural-disk crossfade band.  Slot 42 is `pickPass` — stays 0
  // here (visual pass).  The pick renderer writes 1 at this offset after
  // uploading this buffer via its three-field override path.
  f32[40] = pxFadeStart; // byte 160
  f32[41] = pxFadeEnd; // byte 164
  // f32[42] (pickPass, byte 168) / f32[43] (_padFade1, byte 172) stay zero.

  // Gravitational-lensing block (bytes 176..207).  lensCenterWorld is the
  // camera orbit target this frame; lensThetaERad is the UI-exaggerated
  // Einstein radius.  The pick renderer's overrides are all < 176, so picking
  // lenses with the same parameters the visual pass just wrote.
  f32[44] = lensCenterWorld[0]; // byte 176
  f32[45] = lensCenterWorld[1]; // byte 180
  f32[46] = lensCenterWorld[2]; // byte 184
  u32[47] = lensEnabled ? 1 : 0; // byte 188
  f32[48] = lensThetaERad; // byte 192
  // f32[49..51] (_padLens0/1/2, bytes 196/200/204) stay zero.

  return buf;
}

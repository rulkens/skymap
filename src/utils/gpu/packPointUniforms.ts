/**
 * packPointUniforms — pure packer for the 192-byte `Uniforms` struct.
 *
 * Single source of truth for the visual-pass byte layout.  Both the point
 * renderer's `draw()` and (via the returned buffer) the pick renderer's
 * per-frame snapshot call this function so their packing never drifts.
 *
 * Why a separate module rather than an inner function in `pointRenderer.ts`?
 * The pick path needs to pack a fresh buffer *without* touching the visual
 * pass's uploaded copy.  `pickUniformBytesOf` calls this with the pick-shaped
 * inputs directly — the none-selection sentinel, the `+PICK_PADDING_PX` size,
 * and `pickPass = 1` — so the complete pick image comes out of one packer and
 * the pick renderer uploads it verbatim.  A top-level function satisfies that
 * contract while remaining testable without any GPU device.
 *
 * `pickPass` defaults to 0 (visual pass).  The pick path passes 1 so the shared
 * vertex shader skips the visual-only culls (crossfade-out, intensity floor)
 * that would make disk-sized galaxies unpickable.
 *
 * Byte layout: see `UNIFORM_BYTES` docblock in `pointRenderer.ts`.
 *
 * @module
 */

import type { Mat4 } from 'wgpu-matrix';
import type { PointDrawSettings } from '../../@types/rendering/PointDrawSettings';
import { PROVENANCE_FILTER_CODE } from '../../data/provenanceFilter';

/**
 * Byte size of the `Uniforms` struct as seen by the GPU.  The single
 * source of truth for the alloc in `packPointUniforms` and for any consumer
 * that needs to know the buffer size up front (e.g. the pick renderer).
 * `pointRenderer.ts` re-exports this so existing call-sites that already
 * import from `pointRenderer` don't need a new import path.
 *
 * 192 = (16 + 4 + 4 + 4 + 4 + 8 + 4 + 4) × 4 bytes.  See the `UNIFORM_BYTES`
 * docblock in `pointRenderer.ts` for the full slot-by-slot layout.  The final
 * 4-float block carries the galaxy surface-brightness calibration knobs
 * (galaxySbScale / galaxySbMax / galaxyFalloffStrength) + one pad word.
 */
export const UNIFORM_BYTES = 16 * 4 + 4 * 4 + 4 * 4 + 4 * 4 + 4 * 4 + 8 * 4 + 4 * 4 + 4 * 4; // 192 bytes

/**
 * Allocate and pack a `Uniforms` buffer for the visual point-sprite pass.
 *
 * `viewProj` and `viewportPx` mirror the positional args `PointRenderer.draw`
 * already receives; `settings` carries every per-frame knob.  `pickPass`
 * defaults to 0 (visual pass); `pickUniformBytesOf` passes 1 so the shared
 * vertex shader keeps disk-sized galaxies pickable.
 */
export function packPointUniforms(
  viewProj: Mat4,
  viewportPx: readonly [number, number],
  // Only the packed byte-layout fields are read here — never the draw-only
  // `focusBindGroup` / `fadeOpacityOf` GPU-callback fields or the shader-side
  // `visibleSourceMask`. Narrowing the parameter lets the pick path assemble a
  // pure-value input (`pickUniformBytesOf`) without fabricating GPU objects,
  // while the visual `draw()` still passes its full `PointDrawSettings` (a
  // superset satisfies the `Omit`).
  settings: Omit<PointDrawSettings, 'focusBindGroup' | 'fadeOpacityOf' | 'visibleSourceMask'>,
  // 0 = visual pass, 1 = pick pass. A packed field rather than a post-upload
  // override so the buffer this returns is the complete image for either pass.
  pickPass: number = 0,
): ArrayBuffer {
  const {
    pointSizePx,
    brightness,
    selectedPacked,
    camPosWorld,
    pxPerRad,
    provenance,
    biasMode,
    absMagLimit,
    depthFadeEnabled,
    pxFadeStart,
    pxFadeEnd,
    sbScale,
    sbMax,
    falloffStrength,
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
  // Provenance-audit block: the two axes sit side by side, each as a
  // (highlight, filter) pair, so a new axis is a contiguous append rather
  // than a scatter of booleans across the struct.  The filter is a code from
  // `PROVENANCE_FILTER_CODE`, not a boolean — the shader's cull is tri-state
  // (all / only-measured / only-estimated) and a pair of booleans would admit
  // a nonsense "neither" combination.
  u32[28] = provenance.orientation.highlight ? 1 : 0; // byte 112
  u32[29] = PROVENANCE_FILTER_CODE[provenance.orientation.filter]; // byte 116
  u32[30] = provenance.size.highlight ? 1 : 0; // byte 120
  u32[31] = PROVENANCE_FILTER_CODE[provenance.size.filter]; // byte 124

  // Malmquist-bias state.  Mode through u32, threshold through f32 — both
  // alias the same ArrayBuffer.
  u32[32] = biasMode >>> 0; // byte 128
  f32[33] = absMagLimit; // byte 132
  // f32[34..38] (apparentMagLimit / schechterMStar / schechterAlpha /
  // schechterMLim / schechterNRef) stay zero.  The Schechter / 1-over-Vmax
  // modes read their per-galaxy weights from the per-vertex `schechterRatio`
  // + angular slots (spliced in by `biasCorrectionSubsystem`), so these
  // uniform slots carry nothing — left reserved rather than removed to keep
  // the struct's byte offsets (incl. `pickPass`) stable.
  // Slot 39 closes the Malmquist vec4 group; it hosts `depthFadeEnabled`
  // (unrelated to bias correction) so the provenance block above keeps a
  // contiguous 112..127 run.
  u32[39] = depthFadeEnabled ? 1 : 0; // byte 156

  // Procedural-disk crossfade band.  Slot 42 is `pickPass` (u32) — 0 for the
  // visual pass, 1 when `pickUniformBytesOf` packs the pick image directly.
  f32[40] = pxFadeStart; // byte 160
  f32[41] = pxFadeEnd; // byte 164
  u32[42] = pickPass >>> 0; // byte 168  pickPass (u32)

  // Galaxy surface-brightness calibration knobs.  Slot 43 (byte 172) was the
  // former `_padFade1` pad word, repurposed to `galaxySbScale`; slots 46/47
  // (bytes 184..191) stay zero pad to round the struct to 192 bytes.
  f32[43] = sbScale; // byte 172  galaxySbScale
  f32[44] = sbMax; // byte 176  galaxySbMax
  f32[45] = falloffStrength; // byte 180  galaxyFalloffStrength
  // f32[46..47] (bytes 184..191) stay zero pad → 192 total.

  return buf;
}

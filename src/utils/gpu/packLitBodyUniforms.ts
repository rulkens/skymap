/**
 * packLitBodyUniforms — pure packer for the 80-byte `LitBodyUniforms` struct
 * (`shaders/lib/sphere.wesl`).
 *
 * A lit sphere binds one per-draw uniform buffer carrying its MVP and the sun
 * direction already rotated into the body's local frame. This is the single
 * source of truth for that byte layout: the Earth layer (and any future
 * dedicated lit-sphere renderer) packs through here so the CPU write can never
 * drift from the WGSL struct — a drift the GPU would not report, it would just
 * render the wrong frame (on iOS, drop it silently).
 *
 * ## The ambient floor is NOT packed here
 *
 * The vec3 `sunDirLocal` leaves a 4-byte tail the struct rounds over. That tail
 * is pure padding (`_pad`, zeroed): the ambient floor lives solely in
 * `lib/bodyLighting.wesl`'s `AMBIENT` const, which `litShade` reads directly in
 * every lit path. Carrying an ambient field on the uniform would be a dead
 * second home for the value — the flat planet instance record has no ambient
 * either, so the const is the load-bearing single source.
 *
 * Returns a `Float32Array` (not an `ArrayBuffer`) because that is what a
 * renderer's `draw(uniforms)` receives and uploads via `writeBuffer` — the
 * layer hands the packed record straight through.
 *
 * ## Byte layout (matches `LitBodyUniforms`)
 *
 *   f32 0..15  (byte 0..63):  mvp (column-major mat4x4)
 *   f32 16..18 (byte 64..75): sunDirLocal (vec3, 16-byte aligned)
 *   f32 19     (byte 76..79): _pad (the vec3's trailing pad, left zeroed)
 *
 * @param mvp          16-element column-major MVP (from `composeBodySlabMvp`).
 * @param sunDirLocal  Sun direction in the body's local frame (`sunDirLocal.ts`).
 */

import type { Vec3 } from '../../@types/math/Vec3';

/** f32 count of `LitBodyUniforms` — 16 mvp + 3 sunDirLocal + 1 pad. */
export const LIT_BODY_UNIFORM_FLOATS = 20;

export function packLitBodyUniforms(mvp: Float32Array, sunDirLocal: Readonly<Vec3>): Float32Array {
  const out = new Float32Array(LIT_BODY_UNIFORM_FLOATS);
  out.set(mvp.subarray(0, 16), 0); // bytes 0..63
  out[16] = sunDirLocal[0]; // byte 64
  out[17] = sunDirLocal[1]; // byte 68
  out[18] = sunDirLocal[2]; // byte 72
  // out[19] (byte 76) stays zero — the vec3's trailing pad; ambient is a const.
  return out;
}

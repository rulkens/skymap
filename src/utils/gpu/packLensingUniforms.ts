/**
 * packLensingUniforms — pure packer for the 528-byte `LensingUniforms` struct.
 *
 * Single source of truth for the gravitational-lensing byte layout. The lens
 * data used to ride in the tail of the points `Uniforms` buffer; pulling it
 * into its own block + its own shared bind group lets a second pipeline (the
 * MCPM volume raymarch, a later phase) bind the same buffer. This packer is
 * the one place that knows the layout, so the buffer factory and any future
 * consumer can never drift from it.
 *
 * ## Why a separate pure module rather than an inline closure
 *
 * Same rationale as `packPointUniforms` / `createFocusUniformBuffer`: a
 * top-level pure function is testable without any GPU device, and keeping
 * the layout in one place stops it being re-derived per pipeline. The buffer
 * factory (`createLensingUniformBuffer`) calls this from its `write`.
 *
 * ## WGSL byte layout (528 bytes — 16-byte header + two vec4 per lens)
 *
 *   offset  0 : enabled   u32   master toggle (0 = off, 1 = lens)
 *   offset  4 : count     u32   active lenses (≤ MAX_LENSES)
 *   offset  8 : mode      u32   0 = SIS, 1 = NFW
 *   offset 12 : _pad0     u32   retired scaleRadius word — written ZERO
 *   offset 16 : lenses    array<LensData, 16>   32 bytes each
 *
 * Per lens i (lens base byte = 16 + i*32; float-index base = 4 + i*8):
 *
 *   base+0..+2 : geom.xyz   f32   dirLens.xyz — unit eye→lens direction
 *   base+3     : geom.w     f32   dL — eye→lens distance (Mpc)
 *   base+4     : params.x   f32   thetaERad — Einstein angular radius (rad)
 *   base+5     : params.y   f32   rsMpc — NFW scale radius r_s (Mpc)
 *   base+6..+7 : reserved   f32   written ZERO
 *
 * total = 16 + 16 × 32 = 528 bytes — a multiple of 16 ✓. The two-vec4
 * (geom + params) stride is 32 bytes, keeping each LensData 16-byte-aligned.
 *
 * Packing `dirLens` + `dL` into the `geom` vec4 means the shader does no
 * per-vertex subtract/length/normalize — the CPU supplies the eye-relative
 * direction and distance ready to use. `params.y` carries per-lens r_s so
 * each cluster gets the right deflection peak without a shared global knob;
 * the old header word that held a shared scale radius is retired to `_pad0`.
 *
 * `MAX_LENSES` bounds both the uniform size and the per-vertex ALU cost (iOS
 * headroom — the shader loops over `count ≤ MAX_LENSES`). It MUST match the
 * `LensData` array length in `lib/lensingUniforms.wesl` — the CPU packer and
 * that WGSL array length are the single drift point.
 *
 * @module
 */

import type { LensingUniformsValue } from '../../@types/rendering/LensingUniformsValue';

/**
 * Maximum number of cluster lenses packed into the lensing uniform. The
 * vertex shader loops over `count ≤ MAX_LENSES`, so this bounds both the
 * uniform size and the per-vertex ALU cost. Must match the `LensData` array
 * length in `lib/lensingUniforms.wesl`.
 */
export const MAX_LENSES = 16;

/**
 * Byte size of the `LensingUniforms` struct as seen by the GPU — a 16-byte
 * header (enabled + count + mode + _pad0) plus two `vec4<f32>` per lens (geom
 * carrying dirLens.xyz + dL, params carrying thetaERad + rsMpc + 2 reserved).
 * The single source of truth for the buffer alloc in
 * `createLensingUniformBuffer` and for any consumer that needs the size up
 * front. See the module docblock for the slot-by-slot layout.
 */
export const LENSING_UNIFORM_BYTES = 16 + MAX_LENSES * 32; // 528 bytes at MAX_LENSES = 16

/**
 * Allocate and pack a `LensingUniforms` buffer.
 *
 * The 16-byte header is the master toggle + lens count + lensing mode + a
 * retired pad word (written zero). Each per-lens slot is two vec4s: `geom`
 * carries the eye-relative unit direction (`dirLens`) and eye→lens distance
 * (`dL`) so the shader needs no per-vertex coordinate transforms; `params`
 * carries the Einstein angular radius and per-lens NFW scale radius. Unused
 * lens slots remain zero — `count` gates the shader loop, so they are never
 * read.
 */
export function packLensingUniforms(value: LensingUniformsValue): ArrayBuffer {
  const { enabled, lenses, mode } = value;

  // Pad / unused-lens slots are zero-initialised by `new ArrayBuffer`.
  const buf = new ArrayBuffer(LENSING_UNIFORM_BYTES);
  const f32 = new Float32Array(buf);
  const u32 = new Uint32Array(buf);

  const count = Math.min(lenses.length, MAX_LENSES);
  u32[0] = enabled ? 1 : 0; // byte 0   enabled
  u32[1] = count >>> 0; // byte 4   count
  u32[2] = mode === 'nfw' ? 1 : 0; // byte 8   mode (0 = SIS, 1 = NFW)
  // byte 12  _pad0 — retired scaleRadius word, left zero by ArrayBuffer init.

  for (let i = 0; i < count; i++) {
    const base = 4 + i * 8; // f32 index of this lens's first vec4 (byte 16 + i*32)
    const { dirLens, dL, thetaERad, rsMpc } = lenses[i]!;
    // geom vec4: eye-relative direction + distance — precomputed so the shader
    // needs no per-vertex subtract/length/normalize.
    f32[base] = dirLens[0];
    f32[base + 1] = dirLens[1];
    f32[base + 2] = dirLens[2];
    f32[base + 3] = dL;
    // params vec4: Einstein angular radius + per-lens NFW scale radius.
    f32[base + 4] = thetaERad;
    f32[base + 5] = rsMpc;
    // base+6 and base+7 are reserved — left zero by ArrayBuffer init.
  }

  // Unused lens slots stay zero (count gates the shader loop).
  return buf;
}

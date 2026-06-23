/**
 * packLensingUniforms — pure packer for the 272-byte `LensingUniforms`
 * struct.
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
 * ## WGSL byte layout (16-byte-aligned header, then a vec4 per lens)
 *
 *   offset 0  : enabled     u32   master toggle (0 = off, 1 = lens)
 *   offset 4  : count       u32   active lenses (≤ MAX_LENSES)
 *   offset 8  : mode        u32   0 = SIS, 1 = NFW
 *   offset 12 : scaleRadius f32   NFW r_s in Mpc (SIS ignores)
 *   offset 16 : lenses      array<vec4<f32>, 16>  xyz = centre Mpc,
 *                                  w = peak deflection rad (θ_E in SIS)
 *
 * total = 16 + 16 × 16 = 272 bytes — a multiple of 16 ✓. The `vec4` array
 * is 16-byte-aligned, which is why the four scalar header words exactly fill
 * the first 16-byte slot before it. `mode` + `scaleRadius` repurpose what
 * would otherwise be header padding, so the struct stays tightly packed.
 *
 * `MAX_LENSES` bounds both the uniform size and the per-vertex ALU cost (iOS
 * headroom — the shader loops over `count ≤ MAX_LENSES`). It MUST match the
 * `array<vec4<f32>, N>` length in `lib/lensingUniforms.wesl` — the CPU
 * packer and that WGSL array length are the single drift point.
 *
 * @module
 */

import type { LensingUniformsValue } from '../../@types/rendering/LensingUniformsValue';

/**
 * Maximum number of cluster lenses packed into the lensing uniform. The
 * vertex shader loops over `count ≤ MAX_LENSES`, so this bounds both the
 * uniform size and the per-vertex ALU cost. Must match the
 * `array<vec4<f32>, N>` length in `lib/lensingUniforms.wesl`.
 */
export const MAX_LENSES = 16;

/**
 * Byte size of the `LensingUniforms` struct as seen by the GPU — a 16-byte
 * header (enabled + count + mode + scaleRadius) plus one `vec4<f32>` per
 * lens. The single source of truth for the buffer alloc in
 * `createLensingUniformBuffer` and for any consumer that needs the size up
 * front. See the module docblock for the slot-by-slot layout.
 */
export const LENSING_UNIFORM_BYTES = 16 + MAX_LENSES * 16; // 272 bytes at MAX_LENSES = 16

/**
 * Allocate and pack a `LensingUniforms` buffer.
 *
 * The 16-byte header is the master toggle + lens count + the shared profile
 * knobs (mode + NFW scale radius, applied to every lens this frame); the
 * `vec4` array that follows carries one in-view cluster lens per slot. Unused
 * lens slots stay zero — `count` gates the shader loop, so they are never
 * read.
 */
export function packLensingUniforms(value: LensingUniformsValue): ArrayBuffer {
  const { enabled, lenses, mode, scaleRadiusMpc } = value;

  // Pad / unused-lens slots are zero-initialised by `new ArrayBuffer`.
  const buf = new ArrayBuffer(LENSING_UNIFORM_BYTES);
  const f32 = new Float32Array(buf);
  const u32 = new Uint32Array(buf);

  const count = Math.min(lenses.length, MAX_LENSES);
  u32[0] = enabled ? 1 : 0; // byte 0   enabled
  u32[1] = count >>> 0; // byte 4   count
  u32[2] = mode === 'nfw' ? 1 : 0; // byte 8   mode (0 = SIS, 1 = NFW)
  f32[3] = scaleRadiusMpc; // byte 12  NFW scale radius r_s (Mpc)

  for (let i = 0; i < count; i++) {
    const base = 4 + i * 4; // f32/u32 index of this lens's vec4 (byte 16 + i*16)
    const { center, thetaERad } = lenses[i]!;
    f32[base] = center[0];
    f32[base + 1] = center[1];
    f32[base + 2] = center[2];
    f32[base + 3] = thetaERad;
  }

  // Unused lens slots stay zero (count gates the shader loop).
  return buf;
}

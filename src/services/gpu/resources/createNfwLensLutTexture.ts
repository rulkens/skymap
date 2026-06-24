/**
 * createNfwLensLutTexture — upload a precomputed NFW-lens LUT into an
 * `rgba16float` GPU texture and return its handle.
 *
 * ## Why `rgba16float` + linear, not `rgba32float`
 *
 * WebGPU's `linear` sampler on an `rgba32float` texture requires the
 * `float32-filterable` device feature, which is NOT universally available —
 * WebKit (Safari / iOS) ships strict WebGPU and does not expose it. Packing
 * the four channels (`xPrimary`, `muPrimary`, `xCounter`, `muCounter`) as
 * `rgba16float` instead gives linear filtering with no device-feature
 * dependency. Half precision is more than adequate for the MU_MAX-clamped
 * deflection and magnification values in the LUT.
 *
 * ## Why `texture_2d`, never `texture_1d`
 *
 * The s-axis resolution (height) can be small (e.g. 2 in tests, 64 in
 * production). A `texture_1d` might seem natural for a single row, but
 * `textureSampleLevel` has no 1D overload in WGSL: iOS / WebKit rejects the
 * shader and, because the frame shares a single command encoder, an invalid
 * pipeline causes `encoder.finish()` to produce an invalid buffer and
 * `queue.submit()` drops the entire frame silently. Always use `texture_2d`
 * with height ≥ 1.
 *
 * ## Upload layout
 *
 * Each f32 in `lut.data` is converted to f16 via `floatToF16` (the existing
 * `src/utils/math/floatToF16.ts` converter — not re-implemented here).
 * The resulting `Uint16Array` holds raw IEEE 754 binary16 bit patterns, which
 * WebGPU understands directly for `rgba16float`.
 *
 * `writeTexture` has NO 256-byte `bytesPerRow` alignment requirement (unlike
 * `copyBufferToTexture`), so `bytesPerRow = lut.width * 4 channels * 2 bytes`
 * is valid and no padding is needed.
 */

import type { NfwLensLut } from '../../../@types/lensing/NfwLensLut';
import type { NfwLensLutTexture } from '../../../@types/rendering/NfwLensLutTexture';
import { floatToF16 } from '../../../utils/math/floatToF16';

export function createNfwLensLutTexture(device: GPUDevice, lut: NfwLensLut): NfwLensLutTexture {
  // Pack f32 values to f16 raw bit patterns. Each of the width*height cells
  // stores 4 channels (xPrimary, muPrimary, xCounter, muCounter), so the
  // output is width*height*4 Uint16 values.
  const f16Data = new Uint16Array(lut.width * lut.height * 4);
  for (let i = 0; i < lut.data.length; i++) {
    f16Data[i] = floatToF16(lut.data[i]!);
  }

  const texture = device.createTexture({
    format: 'rgba16float',
    size: [lut.width, lut.height, 1],
    dimension: '2d',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });

  // 4 channels × 2 bytes per f16 per texel; no alignment padding needed for
  // writeTexture (the 256-byte alignment rule only applies to copyBufferToTexture).
  const bytesPerRow = lut.width * 4 * 2;

  device.queue.writeTexture(
    { texture },
    f16Data,
    { bytesPerRow, rowsPerImage: lut.height },
    [lut.width, lut.height, 1],
  );

  const view = texture.createView();

  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  // Guard flag prevents a second destroy() call from reaching the already-
  // destroyed GPUTexture, which would throw a WebGPU validation error.
  let destroyed = false;

  return {
    texture,
    view,
    sampler,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      texture.destroy();
    },
  };
}

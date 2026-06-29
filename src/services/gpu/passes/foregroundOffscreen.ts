/**
 * foregroundOffscreen — full-resolution render target pair for the
 * opaque foreground pass (Earth, Moon, Sun).
 *
 * ### Why two textures rather than one
 *
 * The foreground pass draws opaque geometry that must occlude background
 * geometry by depth-test.  WebGPU requires a depth attachment to run a
 * depth-test; the depth texture here is that attachment.  The colour
 * texture receives the fragment output, which is then OVER-composited
 * onto the HDR target by 'foregroundComposite'.
 *
 * ### Why full resolution (no divisor)
 *
 * Contrast with 'volumeOffscreen' which downsamples by a factor of 3 —
 * the volume raymarcher is per-fragment expensive and its signal is
 * bandlimited, so bilinear upsampling is invisible.  Opaque geometry
 * (planet surfaces, star halos) has hard edges that bilinear upsampling
 * would smear.  Full-resolution rasterisation is the only way to avoid
 * sub-pixel aliasing on close-range geometry.
 *
 * ### Why 'depth32float'
 *
 * The zoom-to-Earth camera moves the near plane across many orders of
 * magnitude.  'depth32float' is the highest precision WebGPU guarantees
 * and avoids z-fighting when the near/far spread is large.  See the
 * 'ForegroundOffscreen' type header for the full rationale.
 *
 * ### Lifecycle
 *
 * Mirrors 'volumeOffscreen.ts:60-93' — 'allocate' is called once at
 * construction and again on every 'resize()'.  Callers must not cache
 * views across a 'resize()' call; they should always read 'colorView'
 * and 'depthView' from the struct.
 */

import type { ForegroundOffscreen } from '../../../@types/rendering/ForegroundOffscreen';
import type { Size } from '../../../@types/rendering/Size';

export function createForegroundOffscreen(device: GPUDevice, size: Size): ForegroundOffscreen {
  let colorTexture: GPUTexture | null = null;
  let colorView: GPUTextureView | null = null;
  let depthTexture: GPUTexture | null = null;
  let depthView: GPUTextureView | null = null;

  function allocate(s: Size): void {
    // Destroy old textures before creating new ones — WebGPU textures hold
    // GPU memory until explicitly destroyed; letting the old handle go
    // out of scope is not sufficient (the GPU-side allocation lives until
    // 'GPUTexture.destroy()' is called).
    if (colorTexture) colorTexture.destroy();
    if (depthTexture) depthTexture.destroy();

    // Full resolution — no divisor.  Canvas dimensions must be >= 1 px
    // (the GPU validates this); the canvas system guarantees it.
    const { width, height } = s;

    colorTexture = device.createTexture({
      label: 'foreground-color-target',
      format: 'rgba16float',
      size: { width, height },
      // RENDER_ATTACHMENT: written by the foreground render pass.
      // TEXTURE_BINDING: sampled by 'foregroundComposite' in the
      // subsequent OVER-composite step.
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    colorView = colorTexture.createView();

    depthTexture = device.createTexture({
      label: 'foreground-depth-target',
      format: 'depth32float',
      size: { width, height },
      // RENDER_ATTACHMENT only — depth values are never sampled by a
      // downstream shader, they only serve the depth-test during the
      // foreground render pass itself.
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    depthView = depthTexture.createView();
  }

  allocate(size);

  return {
    get colorView(): GPUTextureView {
      if (!colorView) throw new Error('foregroundOffscreen: colorView accessed after destroy');
      return colorView;
    },
    get depthView(): GPUTextureView {
      if (!depthView) throw new Error('foregroundOffscreen: depthView accessed after destroy');
      return depthView;
    },
    resize(s: Size): void {
      allocate(s);
    },
    destroy(): void {
      if (colorTexture) colorTexture.destroy();
      if (depthTexture) depthTexture.destroy();
      colorTexture = null;
      colorView = null;
      depthTexture = null;
      depthView = null;
    },
  };
}

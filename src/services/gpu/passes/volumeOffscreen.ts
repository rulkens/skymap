/**
 * volumeOffscreen — downsampled rgba16float render target for the
 * scalar-volume raymarch.  Allocated at
 * `floor(canvas / VOLUME_RENDER_SCALE_DIVISOR)` per axis; the upsample
 * pass bilinearly samples it back into the HDR target.
 *
 * ### Why downsample
 *
 * The scalar-volume fragment shader is the heaviest per-pixel pass
 * (192 raymarch steps × N active fields × every back-facing cube
 * fragment).  The 3D volume texture is bandlimited and the per-fragment
 * dither already covers sub-pixel aliasing, so full-res raymarching is
 * wasted work.  Bilinear interpolation on the way back up is invisible
 * for low-frequency volumetric data.
 *
 * ### Why separate from PostProcess
 *
 * `PostProcess` owns the HDR target — the tone-map's *input*.  This
 * offscreen is the volume pass's *output* — an intermediate buffer
 * that never reaches the tone-map.  One module per render target keeps
 * each consumer relationship explicit.
 *
 * ### Why on `state.gpu.volumeOffscreen` instead of inside the renderer
 *
 * `scalarVolumeRenderer` is a draw-only helper — its colour attachment
 * is provided by whoever opens the render pass.  Render-target
 * lifetimes live on engine state, parallel to `state.gpu.postProcess`;
 * renderers are pure draw producers.
 *
 * ### Why `floor` not `round`
 *
 * `floor(canvas / N)` matches the upsample shader's "sample at uv"
 * semantics — bilinear sampling of a downsampled target at full-res
 * fragment UVs is equivalent to an Nx upscale.  Min 1 px guards small
 * canvas sizes where `floor(...)` would otherwise yield 0 (illegal
 * texture dimension).
 *
 * ### Keep the divisor in sync with `encodeVolumes.ts`
 *
 * Both files import `VOLUME_RENDER_SCALE_DIVISOR` from here to compute
 * the same `floor(canvas / N)` size.  The two must stay equal —
 * drift would either tile the offscreen target (viewport > texture)
 * or waste texels (viewport < texture).
 */

import type { VolumeOffscreen } from '../../../@types/rendering/VolumeOffscreen';
import type { Size } from '../../../@types/rendering/Size';

/**
 * Per-axis downsample factor for the volume offscreen target.
 *
 * Total fragment-count reduction is the square of this value (e.g. 4 →
 * 1/16 the fragments).  `encodeVolumes.ts` imports the SAME constant
 * when computing the viewport passed to `scalarVolumeRenderer.draw`, so
 * "viewport == texture size" is enforced by construction.  Tune this
 * dial here and both sites move together.
 */
export const VOLUME_RENDER_SCALE_DIVISOR = 3;

export function createVolumeOffscreen(device: GPUDevice, size: Size): VolumeOffscreen {
  let texture: GPUTexture | null = null;
  let view: GPUTextureView | null = null;

  function allocate(s: Size): void {
    if (texture) texture.destroy();
    const w = Math.max(1, Math.floor(s.width / VOLUME_RENDER_SCALE_DIVISOR));
    const h = Math.max(1, Math.floor(s.height / VOLUME_RENDER_SCALE_DIVISOR));
    texture = device.createTexture({
      label: 'volume-quarter-res-target',
      format: 'rgba16float',
      size: { width: w, height: h },
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    view = texture.createView();
  }

  allocate(size);

  return {
    get view(): GPUTextureView {
      if (!view) throw new Error('volumeOffscreen: view accessed after destroy');
      return view;
    },
    resize(s: Size): void {
      allocate(s);
    },
    destroy(): void {
      if (texture) texture.destroy();
      texture = null;
      view = null;
    },
  };
}

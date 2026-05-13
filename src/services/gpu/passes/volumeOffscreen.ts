/**
 * volumeOffscreen — owns the half-resolution rgba16float render target
 * that the scalar-volume raymarch draws into.
 *
 * ### Why it exists
 *
 * The scalar-volume fragment shader is the most expensive per-pixel
 * pass in the renderer (192 raymarch steps × N active fields × every
 * back-facing cube fragment).  On a 4K canvas with two fields enabled
 * that's tens of millions of texture samples per frame.  The 3D volume
 * texture is bandlimited and the per-fragment dither already covers
 * sub-pixel aliasing, so rendering at full backing-store resolution
 * wastes work.
 *
 * The fix: every volume field raymarches into THIS target at half each
 * axis (1/4 the fragment count), then a fullscreen upsample pass
 * bilinearly samples it and additively blends the result into the HDR
 * target.  The math is identical up to bilinear interpolation, which
 * is fine for low-frequency volumetric data.
 *
 * ### Why a separate module from PostProcess
 *
 * `PostProcess` owns the HDR target because that target is the
 * tone-map's *input*.  The half-res target is the volume pass's
 * *output* — it's an intermediate buffer that never reaches the
 * tone-map.  Co-locating both targets on one module conflated two
 * responsibilities and made the role of `PostProcess` ambiguous.
 * Splitting keeps each module focused on one render target with one
 * downstream consumer.
 *
 * ### Why on `state.gpu.volumeOffscreen` instead of inside the renderer
 *
 * The volume *renderer* (`scalarVolumeRenderer`) is a draw-only
 * helper — it does not own its colour attachment.  The attachment is
 * provided by whoever opens the render pass.  Keeping the target
 * here, parallel to `state.gpu.postProcess`, matches the existing
 * pattern where render-target lifetimes are owned by the engine state
 * and renderers are pure draw producers.
 *
 * ### Why `floor` not `round`
 *
 * `floor(canvas / 2)` matches the upsample shader's "sample at uv"
 * semantics — sampling a half-res target with linear filtering at
 * full-res fragment UVs is equivalent to a 2x bilinear upscale.  Min
 * 1 px protects against the degenerate `floor(1 / 2) = 0` case (legal
 * canvas sizes, illegal texture sizes).
 *
 * ### Lifetime
 *
 * The half-res target's lifetime mirrors the HDR target's: both are
 * sized to the canvas backing store, both recreated on resize, both
 * released on destroy.  But that's coincidence, not coupling — the
 * resize call site simply invokes both `postProcess.resize(...)` and
 * `volumeOffscreen.resize(...)`.  Either module can change shape
 * without touching the other.
 */

import type { VolumeOffscreen } from '../../../@types/rendering/VolumeOffscreen';
import type { Size } from '../../../@types/rendering/Size';

export function createVolumeOffscreen(device: GPUDevice, size: Size): VolumeOffscreen {
  let texture: GPUTexture | null = null;
  let view: GPUTextureView | null = null;

  function allocate(s: Size): void {
    if (texture) texture.destroy();
    const w = Math.max(1, Math.floor(s.width / 2));
    const h = Math.max(1, Math.floor(s.height / 2));
    texture = device.createTexture({
      label: 'volume-half-res-target',
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

/**
 * postProcess — single module owning the HDR offscreen target and the
 * swap-chain render pass that tone-maps its contents into the frame.
 *
 * ### Why one module
 *
 * The HDR texture and the swap-chain tone-map step are conceptually one
 * pipeline stage — "every visible draw pass writes into a shared
 * rgba16float target, then the frame's final pass tone-maps it into the
 * swap chain".  Wiring them through the engine as two pieces meant two
 * construction sites, two destroy sites, two resize calls (only one of
 * which was actually needed — the tone-map step holds no size-dependent
 * state), and two arguments through `renderFrame`.  Collapsing them
 * removes that ceremony without losing any of the rationale, which is why
 * this docstring carries the HDR-target "why" comments forward verbatim.
 *
 * The actual tone-map *composite* — the covering-triangle blit, the
 * sampler, the curve uniform, the pipeline — no longer lives here.  It is
 * one instance of the general "merge one offscreen texture into a target"
 * operation, so this module delegates it to the shared `Compositor`
 * (`compositor.draw(pass, hdrView, 'replace', tone)`).  This module keeps
 * only what is genuinely its own: the HDR target's lifecycle and the
 * swap-chain render pass it feeds.
 *
 * ### Why the HDR target lives here at all
 *
 * The HDR target's lifetime is "as long as the canvas size is
 * constant" — it gets thrown away and recreated on resize.  Keeping
 * that lifecycle outside the renderer classes (which own pipelines,
 * vertex buffers, and other long-lived resources) avoids tangling
 * re-creation paths.  The engine's resize handler calls
 * `postProcess.resize(...)` once per resize and the new view
 * propagates through the per-frame `draw(...)` calls.
 *
 * ### Why rgba16float and not rgba32float
 *
 * 16-bit half-float is the WebGPU minimum for sampleable + renderable
 * floating-point textures; 32-bit float requires the
 * `float32-filterable` feature on most platforms.  Half-float gives us
 * ~5 decimal digits of precision and a range of ±65 504, which is more
 * than enough for our additive billboard math (per-fragment alpha
 * contributions in [0, 1], accumulating to peaks of maybe a few hundred
 * in the densest cluster cores before tone-mapping).
 *
 * ### Why TEXTURE_BINDING + RENDER_ATTACHMENT
 *
 * RENDER_ATTACHMENT lets the points/quads/disks pipelines write into
 * it.  TEXTURE_BINDING lets the compositor's fragment shader sample from
 * it.  Both flags are required on the same texture — they're set as a
 * bitmask because WebGPU descriptors don't support "sample-or-render"
 * tagging after creation.
 *
 * ### Why no depth attachment
 *
 * An earlier revision (commit `716eb6b`) added a `depth24plus`
 * companion texture so the Milky Way layer could be occluded by
 * per-galaxy thumbnail / disk overlays via depth-test.  Commit
 * `28aced5` then switched every overlay pipeline to pure additive
 * blending (`srcFactor: 'one', dstFactor: 'one'`) with
 * `depthWriteEnabled: false`, which makes ordering moot: A+B = B+A,
 * so no occlusion is needed.  At that point the depth buffer became
 * dead infrastructure — every frame cleared it to 1.0 and nothing
 * ever wrote a different value.  Removed the attachment to drop the
 * per-frame clear, the GPU memory, and the cross-cutting "every
 * pipeline must declare matching depthStencil state" constraint that
 * already bit us once during HMR.  If a future pass needs depth
 * (e.g. a truly opaque overlay), it can be added back at that point.
 *
 * ### Why post-process tone-map, not in-shader per pipeline
 *
 * Every renderer (point, quad, disk) writes its own HDR contribution
 * into the same target with additive blending.  Doing tone-mapping in
 * each renderer's fragment stage would tone-map *each contribution*
 * independently — but tone-mapping is a non-linear operation, so
 * `tonemap(a + b) ≠ tonemap(a) + tonemap(b)`.  The whole point of the
 * HDR pass is to let contributions accumulate linearly and *then*
 * compress.  Hence: one post-process at the end of the frame.
 */

import type { Compositor } from '../../../@types/rendering/Compositor';
import type { Size } from '../../../@types/rendering/Size';
import type { PostProcess } from '../../../@types/rendering/PostProcess';

// ─── Aggregate factory ────────────────────────────────────────────────────

export function createPostProcess(init: {
  device: GPUDevice;
  size: Size;
  compositor: Compositor;
}): PostProcess {
  const { device, size, compositor } = init;

  // ── HDR target (lifecycle-controlled by resize/destroy) ───────────────
  let hdrTexture: GPUTexture | null = null;
  let hdrView: GPUTextureView | null = null;

  function allocateHdr(s: Size): void {
    if (hdrTexture) hdrTexture.destroy();
    hdrTexture = device.createTexture({
      label: 'hdr-target',
      format: 'rgba16float',
      size: { width: s.width, height: s.height },
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    hdrView = hdrTexture.createView();
  }

  allocateHdr(size);

  return {
    get view(): GPUTextureView {
      if (!hdrView) throw new Error('postProcess: view accessed after destroy');
      return hdrView;
    },
    resize(s: Size): void {
      allocateHdr(s);
    },
    draw(encoder, swapView, exposure, curve, timingDescriptor): void {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: swapView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        // Per-pass GPU timing.  When `timingDescriptor` is undefined
        // (no `?gpuTimings` gate active), the field is omitted and
        // WebGPU treats it as "no timing requested".  The spread
        // pattern preserves byte-identity for the timing-disabled
        // path so the visual baseline snapshot is unchanged.
        ...(timingDescriptor ? { timestampWrites: timingDescriptor } : {}),
      });
      // Delegate the covering-triangle tone-map blit to the shared
      // compositor: HDR view → swap chain with 'replace' (overwrite, no
      // blend) and the tone curve/exposure.  The raw exposure is
      // forwarded — the clamp lives in the compositor's draw.
      compositor.draw(pass, hdrView!, 'replace', { exposure, curve });
      pass.end();
    },
    destroy(): void {
      if (hdrTexture) hdrTexture.destroy();
      hdrTexture = null;
      hdrView = null;
    },
  };
}

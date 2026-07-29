/**
 * pickDebugOverlay — fullscreen pass that colour-maps the r32uint pick
 * texture onto the tone-mapped swap chain.
 *
 * ### Colouring: hue by source code
 *
 * The fragment derives every pixel's hue from its packed source code via
 * golden-angle spacing (`fract(sourceCode * 0.618034)`), so each pickable
 * source — galaxy catalog, structure ring, Gaia star, famous star, planet,
 * Earth — reads as its own stable, well-separated colour with no
 * hand-maintained palette to keep in step with `Source`. A hash of the
 * 27-bit `localIdx` modulates brightness (HSV value) so adjacent instances
 * of the same source stay individually distinguishable. See
 * `shaders/pickDebugOverlay/fragment.wesl` for the full rationale.
 *
 * ### Why a dedicated factory
 *
 * Same shape as `additiveUpsample`: a single covering-triangle pipeline
 * that samples one texture and writes one RGBA target.  Each fullscreen
 * blit lives in its own factory under `services/gpu/passes/` so the
 * consumer threads exactly one descriptor through one call.  Bundling
 * them would force any caller to construct dependencies it doesn't use.
 *
 * ### Sampler-less
 *
 * The pick texture is `r32uint` — integer textures can't be sampled
 * via `textureSample` (that operation is float-only).  The fragment
 * uses `textureLoad` at exact integer texel coordinates, which doesn't
 * need a sampler binding.  Saves a bind-group slot and a sampler
 * allocation versus the additiveUpsample shape.
 */

import vsCode from '../shaders/pickDebugOverlay/vertex.wesl?static';
import fsCode from '../shaders/pickDebugOverlay/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';
import { PREMULTIPLIED_OVER_BLEND } from '../lib/blendStates';
import type { PickDebugOverlay } from '../../../@types/rendering/PickDebugOverlay';

export function createPickDebugOverlay(
  device: GPUDevice,
  swapChainFormat: GPUTextureFormat,
): PickDebugOverlay {
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'pickDebugOverlay.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'pickDebugOverlay.fragment');

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'pickDebugOverlay-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        // sampleType 'uint' — matches the r32uint pick texture format.
        // Float / sint would fail validation when the bind group is
        // built against the actual texture view.
        texture: { sampleType: 'uint' },
      },
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'pickDebugOverlay-pipeline',
    layout: device.createPipelineLayout({
      label: 'pickDebugOverlay-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module: vsModule, entryPoint: 'vs' },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [
        {
          format: swapChainFormat,
          // Premultiplied OVER — same convention as markerLines,
          // labels, structureMarker.  Fragment shader emits
          // 'vec4<f32>(col * alpha, alpha)' so this blend produces
          // the standard "src on top of dst" composite.  Background
          // pixels emit alpha = 0, which evaluates to a no-op blend
          // (preserves the underlying scene exactly).
          blend: PREMULTIPLIED_OVER_BLEND,
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
  });

  return {
    draw(pass: GPURenderPassEncoder, pickView: GPUTextureView): void {
      // Bind group rebuilt per draw — the pick texture view is recreated
      // whenever the canvas resizes (pickRenderer's ensureTextures()
      // tears down + reallocates), so caching across resize would bind
      // a destroyed view.  One alloc per frame is negligible against a
      // fullscreen blit.
      const bindGroup = device.createBindGroup({
        label: 'pickDebugOverlay-bg',
        layout: bindGroupLayout,
        entries: [{ binding: 0, resource: pickView }],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3, 1, 0, 0);
    },
    destroy(): void {
      // No GPUTexture / GPUBuffer owned by this pass; pipeline + BGL
      // are GC'd when their last reference drops.  Method present
      // for lifecycle symmetry with the other pass factories.
    },
  };
}

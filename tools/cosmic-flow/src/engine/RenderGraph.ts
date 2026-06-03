/**
 * createRenderGraph — the HDR-accumulate → tonemap stage of the engine.
 *
 * This is the render-graph seam: it owns the shared `rgba16float` accumulation
 * texture every visualization draws additively into, and the single
 * fullscreen-triangle tonemap pass that resolves that linear-light buffer to
 * the swap-chain. Layers never see the swap format or the resolve — they target
 * `hdrFormat` and the graph handles the rest.
 *
 * Why a method (`accumView()`) over a field: the accum texture is destroyed and
 * recreated whenever the drawable resizes, so a cached `GPUTextureView` would
 * dangle. Callers fetch the live view each frame.
 *
 * The blit pipeline uses `layout:'auto'`; its bind-group layout is therefore
 * derived from this pipeline and only valid here, so the bind group is rebuilt
 * (alongside the texture) inside `resize` rather than handed in from outside.
 *
 * Spike provenance: `tools/spike/public/index.html` lines ~382-401 (WGSL) and
 * ~513-547 (pipeline, accum texture, resize, blit bind group). The blit uniform
 * write order — `[exposure, contrast]` — matches the spike's line ~798.
 */
import type { RenderGraph } from '../../@types/engine/RenderGraph';
import { blitWgsl } from './blit.wgsl';

const HDR_FORMAT: GPUTextureFormat = 'rgba16float';

export function createRenderGraph(
  device: GPUDevice,
  swapFormat: GPUTextureFormat,
  makeShader: (code: string, label: string) => GPUShaderModule,
): RenderGraph {
  const blitModule = makeShader(blitWgsl, 'blit');

  const blitPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: blitModule, entryPoint: 'vsFullscreen' },
    fragment: { module: blitModule, entryPoint: 'fsTonemap', targets: [{ format: swapFormat }] },
    primitive: { topology: 'triangle-list' },
  });

  const blitSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  // 16 bytes: exposure (f32 @0) + contrast (f32 @4) + 8 bytes pad to the
  // minimum uniform-buffer alignment.
  const blitUniform = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  let curWidth = 0;
  let curHeight = 0;
  let accumTex: GPUTexture | null = null;
  let accumTexView: GPUTextureView | null = null;
  let blitBindGroup: GPUBindGroup | null = null;

  function resize(width: number, height: number): void {
    // No-op on an unchanged drawable size — recreating the texture every frame
    // would thrash GPU memory and invalidate the bind group needlessly.
    if (width === curWidth && height === curHeight && accumTex) return;
    curWidth = width;
    curHeight = height;

    accumTex?.destroy();
    accumTex = device.createTexture({
      size: [width, height],
      format: HDR_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    accumTexView = accumTex.createView();

    blitBindGroup = device.createBindGroup({
      layout: blitPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: accumTexView },
        { binding: 1, resource: blitSampler },
        { binding: 2, resource: { buffer: blitUniform } },
      ],
    });
  }

  function accumView(): GPUTextureView {
    if (!accumTexView) {
      throw new Error('RenderGraph.accumView: call resize() before requesting the accum view');
    }
    return accumTexView;
  }

  function tonemap(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    exposure: number,
    contrast: number,
  ): void {
    if (!blitBindGroup) {
      throw new Error('RenderGraph.tonemap: call resize() before tonemapping');
    }
    device.queue.writeBuffer(blitUniform, 0, new Float32Array([exposure, contrast]));
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: target,
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(blitPipe);
    pass.setBindGroup(0, blitBindGroup);
    pass.draw(3);
    pass.end();
  }

  function dispose(): void {
    accumTex?.destroy();
    accumTex = null;
    accumTexView = null;
    blitBindGroup = null;
    blitUniform.destroy();
  }

  return {
    hdrFormat: HDR_FORMAT,
    accumView,
    resize,
    tonemap,
    dispose,
  };
}

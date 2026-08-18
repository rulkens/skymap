/**
 * createRenderGraph — the HDR-accumulate → tonemap stage of the engine.
 *
 * Same shape as tools/flow-workbench's RenderGraph: it owns the shared
 * `rgba16float` accumulation texture every future MCPM layer will draw
 * additively into, and the single fullscreen-triangle tonemap pass that
 * resolves that linear-light buffer to the swap-chain. For T1 there is
 * nothing to accumulate yet — Viewport clears the accum texture to a colour
 * and blits it straight through.
 *
 * `accumView()` is a method, not a field: the accum texture is destroyed and
 * recreated whenever the drawable resizes, so a cached `GPUTextureView` would
 * dangle. The blit pipeline uses `layout:'auto'`, so its bind group is rebuilt
 * alongside the texture inside `resize` rather than handed in from outside.
 *
 * The blit uniform write order is `[exposure, contrast]`.
 *
 * The graph is also where a layer becomes part of the frame: a pass that is
 * constructed but not registered here is silently never opened.
 */
import type { TracePass, TraceSource, TraceView } from './tracePass';
import { createTracePass } from './tracePass';
import blitWgsl from './shaders/blit.wesl?static';

const HDR_FORMAT: GPUTextureFormat = 'rgba16float';

export type RenderGraph = {
  /** The HDR accumulation format every layer's pipeline must target ('rgba16float'). */
  readonly hdrFormat: GPUTextureFormat;
  /** The current HDR target view. A method (not a field): the texture is rebuilt on resize. */
  accumView(): GPUTextureView;
  /** Recreate the accum texture + blit bind group iff the drawable size changed. */
  resize(width: number, height: number): void;
  /**
   * Build the trace raymarch over `source` and make it the frame's base layer.
   * Called once the sim harness exists (it owns the trace buffer); replaces and
   * disposes any pass attached before.
   */
  attachTrace(source: TraceSource): void;
  /** March the attached trace pass into the accum target. Throws if none is attached. */
  drawTrace(encoder: GPUCommandEncoder, view: TraceView): void;
  /** Tonemap the accum buffer into `target`: Reinhard + contrast + sRGB gamma. */
  tonemap(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    exposure: number,
    contrast: number,
  ): void;
  /** Destroy the accum texture + blit uniform buffer. */
  dispose(): void;
};

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
  let tracePass: TracePass | null = null;

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

  function attachTrace(source: TraceSource): void {
    tracePass?.dispose();
    tracePass = createTracePass({
      device,
      targetFormat: HDR_FORMAT,
      makeShader,
      source,
    });
  }

  function drawTrace(encoder: GPUCommandEncoder, view: TraceView): void {
    if (!tracePass) {
      throw new Error('RenderGraph.drawTrace: call attachTrace() before drawing the raymarch');
    }
    tracePass.draw(encoder, accumView(), view);
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
    tracePass?.dispose();
    tracePass = null;
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
    attachTrace,
    drawTrace,
    tonemap,
    dispose,
  };
}

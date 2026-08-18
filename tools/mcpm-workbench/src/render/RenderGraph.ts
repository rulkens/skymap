/**
 * createRenderGraph — the HDR-accumulate → tonemap stage (same shape as
 * tools/flow-workbench's): it owns the shared `rgba16float` accum texture every
 * MCPM layer draws into and the fullscreen tonemap that resolves it to the
 * swap-chain. `drawTrace` and `drawSplat` are the two mutually exclusive base
 * layers and each CLEARS that texture, so an additive layer (`drawGalaxyOverlay`)
 * must be encoded after one of them; and a pass that is constructed but never
 * registered here is silently never opened.
 *
 * `accumView()` is a method, not a field: the texture is recreated on resize, so
 * a cached view would dangle, and the blit's `layout:'auto'` bind group is
 * rebuilt alongside it. The blit uniform write order is `[exposure, contrast]`.
 */
import type { AgentBuffers } from '../../@types/AgentBuffers';
import type { GridBox } from '../../@types/GridBox';
import type { GalaxyOverlayPass } from './galaxyOverlayPass';
import { createGalaxyOverlayPass } from './galaxyOverlayPass';
import type { SplatPass, SplatView } from './splatPass';
import { createSplatPass } from './splatPass';
import type { TracePass, TraceSource, TraceView } from './tracePass';
import { createTracePass } from './tracePass';
import type { McpmCameraView } from './writeMcpmCamera';
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
  /**
   * Build the two agent-fed views — the splat and the galaxy-point overlay — over the
   * harness's lanes. Both die with their harness, so this is re-called on every rebuild.
   */
  attachAgents(agents: AgentBuffers, box: GridBox): void;
  /** Splat the agents into the accum target. CLEARS it: this is the whole frame. */
  drawSplat(encoder: GPUCommandEncoder, view: SplatView): void;
  /** Dot the catalog points over whatever is already in the accum target. */
  drawGalaxyOverlay(encoder: GPUCommandEncoder, view: McpmCameraView): void;
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
  let splatPass: SplatPass | null = null;
  let galaxyOverlayPass: GalaxyOverlayPass | null = null;

  function resize(width: number, height: number): void {
    // No-op on an unchanged drawable size — recreating the texture every frame
    // would thrash GPU memory and invalidate the bind group needlessly.
    if (width === curWidth && height === curHeight && accumTex) return;
    curWidth = width;
    curHeight = height;
    // The splat's accumulation buffer is one u32 per pixel, so it follows the drawable
    // too — a stale one indexes past its own end on the first larger frame.
    splatPass?.resize(width, height);

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

  function attachAgents(agents: AgentBuffers, box: GridBox): void {
    splatPass?.dispose();
    galaxyOverlayPass?.dispose();
    const shared = { device, targetFormat: HDR_FORMAT, makeShader, agents, box };
    splatPass = createSplatPass(shared);
    galaxyOverlayPass = createGalaxyOverlayPass(shared);
    // A pass attached after the first resize would otherwise never be sized: resize()
    // returns early once the drawable stops changing, which is the steady state.
    if (curWidth > 0) splatPass.resize(curWidth, curHeight);
  }

  function drawSplat(encoder: GPUCommandEncoder, view: SplatView): void {
    if (!splatPass) {
      throw new Error('RenderGraph.drawSplat: call attachAgents() before splatting');
    }
    splatPass.draw(encoder, accumView(), view);
  }

  function drawGalaxyOverlay(encoder: GPUCommandEncoder, view: McpmCameraView): void {
    if (!galaxyOverlayPass) {
      throw new Error('RenderGraph.drawGalaxyOverlay: call attachAgents() before drawing');
    }
    galaxyOverlayPass.draw(encoder, accumView(), view);
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
    splatPass?.dispose();
    splatPass = null;
    galaxyOverlayPass?.dispose();
    galaxyOverlayPass = null;
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
    attachAgents,
    drawSplat,
    drawGalaxyOverlay,
    tonemap,
    dispose,
  };
}

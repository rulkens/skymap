/**
 * createRenderGraph — the HDR-accumulate → tonemap stage (same shape as
 * tools/flow-workbench's): it owns the shared `rgba16float` accum texture every
 * MCPM layer draws into and the fullscreen tonemap that resolves it to the
 * swap-chain. No layer clears: `clear()` opens the frame, then any subset of
 * `drawTrace` / `drawSplat` / `drawGalaxyOverlay` / `drawVolpath` loads and
 * blends one/one onto it, in that order. A pass constructed but never
 * registered here is silently never opened.
 *
 * `accumView()` is a method, not a field: the texture is recreated on resize, so
 * a cached view would dangle, and the blit's `layout:'auto'` bind group is
 * rebuilt alongside it. The blit uniform write order is `[exposure, contrast]`.
 * Draw order: `drawTrace` / `drawSplat` / `drawGalaxyOverlay` / `drawVolpath` /
 * `drawBoxPreview`, last so its wireframe sits over the galaxy dots.
 */
import type { AgentBuffers } from '../../@types/AgentBuffers';
import type { GridBox } from '../../@types/GridBox';
import { createBoxPreviewPass, type BoxPreviewPass } from './boxPreviewPass';
import type { GalaxyOverlayOptions, GalaxyOverlayPass } from './galaxyOverlayPass';
import { createGalaxyOverlayPass } from './galaxyOverlayPass';
import type { SplatPass, SplatView } from './splatPass';
import { createSplatPass } from './splatPass';
import type { TracePass, TraceSource, TraceView } from './tracePass';
import { createTracePass } from './tracePass';
import type { VolpathParams, VolpathPass } from './volpathPass';
import { createVolpathPass } from './volpathPass';
import type { McpmCameraView } from './writeMcpmCamera';
import blitWgsl from './shaders/blit.wesl?static';

const HDR_FORMAT: GPUTextureFormat = 'rgba16float';

// One/one premultiplied, every layer: the graph owns the clear, each pass LOADs and adds.
// Fifth copy of this literal was the trigger (tracePass, splatPass, galaxyOverlayPass,
// volpathPass, boxPreviewPass) — an omitted blend REPLACES everything drawn beneath it
// instead of adding to it, alpha lane included, so a layer that forgets this errors loud
// (missing import) rather than silently wiping the frame.
export const LAYER_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
};

export type RenderGraph = {
  /** The HDR accumulation format every layer's pipeline must target ('rgba16float'). */
  readonly hdrFormat: GPUTextureFormat;
  /** The current HDR target view. A method (not a field): the texture is rebuilt on resize. */
  accumView(): GPUTextureView;
  /** Recreate the accum texture + blit bind group iff the drawable size changed. */
  resize(width: number, height: number): void;
  /**
   * Black out the accum target. Every frame opens with this, whether or not a layer
   * follows: with all layers off the tonemap would otherwise resolve last frame's pixels.
   */
  clear(encoder: GPUCommandEncoder): void;
  /**
   * Build the trace raymarch over `source`. Called once the sim harness exists (it owns
   * the trace buffer); replaces and disposes any pass attached before.
   */
  attachTrace(source: TraceSource): void;
  /** March the attached trace pass into the accum target. Throws if none is attached. */
  drawTrace(encoder: GPUCommandEncoder, view: TraceView): void;
  /**
   * Build the path tracer over `source` — the same `TraceSource` `attachTrace` takes, so
   * both passes are attached together in `attachTrace`'s caller. Replaces and disposes any
   * pass attached before.
   */
  attachVolpath(source: TraceSource): void;
  /** Accumulate one path-traced sample per pixel and resolve. Throws if none is attached. */
  drawVolpath(encoder: GPUCommandEncoder, view: McpmCameraView, params: VolpathParams): void;
  /** Drop the path tracer's accumulated samples; a no-op before `attachVolpath`. */
  resetVolpath(): void;
  /**
   * Build the two agent-fed layers — the swarm splat and the galaxy points — over the
   * harness's lanes. Both die with their harness, so this is re-called on every rebuild.
   */
  attachAgents(agents: AgentBuffers, box: GridBox): void;
  /** Splat the free agents onto whatever is already in the accum target. */
  drawSplat(encoder: GPUCommandEncoder, view: SplatView): void;
  /** Dot the catalog points onto whatever is already in the accum target. */
  drawGalaxyOverlay(
    encoder: GPUCommandEncoder,
    view: McpmCameraView,
    options: GalaxyOverlayOptions,
  ): void;
  /**
   * Wireframe `pendingBox` (converted into `builtBox`'s voxel frame) over whatever is
   * already in the accum target — drawn last so it sits over the galaxy dots.
   */
  drawBoxPreview(
    encoder: GPUCommandEncoder,
    view: McpmCameraView,
    builtBox: GridBox,
    pendingBox: GridBox,
  ): void;
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
  let volpathPass: VolpathPass | null = null;
  let splatPass: SplatPass | null = null;
  let galaxyOverlayPass: GalaxyOverlayPass | null = null;
  // Eager, not lazy like the agent-fed passes above (attachTrace/attachAgents, called
  // once the harness exists): it needs neither the harness nor a box to compile, so
  // building it here (graph construction) is what makes a broken boxLines.wesl fail at
  // boot instead of surviving until someone drags a grid-box slider. This is about
  // WITHIN one graph's construction, not across rebuilds — createRenderGraph itself runs
  // inside Viewport's buildFromPoints, so every pass here, this one included, is torn
  // down and rebuilt with the rest of the graph on every harness rebuild.
  const boxPreviewPass: BoxPreviewPass = createBoxPreviewPass({
    device,
    targetFormat: HDR_FORMAT,
    blend: LAYER_BLEND,
    makeShader,
  });

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

  function clear(encoder: GPUCommandEncoder): void {
    const pass = encoder.beginRenderPass({
      label: 'mcpm-accum-clear',
      colorAttachments: [
        {
          view: accumView(),
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          storeOp: 'store',
        },
      ],
    });
    pass.end();
  }

  function attachTrace(source: TraceSource): void {
    tracePass?.dispose();
    tracePass = createTracePass({
      device,
      targetFormat: HDR_FORMAT,
      blend: LAYER_BLEND,
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

  function attachVolpath(source: TraceSource): void {
    volpathPass?.dispose();
    volpathPass = createVolpathPass({
      device,
      targetFormat: HDR_FORMAT,
      blend: LAYER_BLEND,
      makeShader,
      source,
    });
  }

  function drawVolpath(
    encoder: GPUCommandEncoder,
    view: McpmCameraView,
    params: VolpathParams,
  ): void {
    if (!volpathPass) {
      throw new Error('RenderGraph.drawVolpath: call attachVolpath() before drawing');
    }
    volpathPass.draw(encoder, accumView(), view, params);
  }

  function resetVolpath(): void {
    volpathPass?.reset();
  }

  function attachAgents(agents: AgentBuffers, box: GridBox): void {
    splatPass?.dispose();
    galaxyOverlayPass?.dispose();
    const shared = {
      device,
      targetFormat: HDR_FORMAT,
      blend: LAYER_BLEND,
      makeShader,
      agents,
      box,
    };
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

  function drawGalaxyOverlay(
    encoder: GPUCommandEncoder,
    view: McpmCameraView,
    options: GalaxyOverlayOptions,
  ): void {
    if (!galaxyOverlayPass) {
      throw new Error('RenderGraph.drawGalaxyOverlay: call attachAgents() before drawing');
    }
    galaxyOverlayPass.draw(encoder, accumView(), view, options);
  }

  function drawBoxPreview(
    encoder: GPUCommandEncoder,
    view: McpmCameraView,
    builtBox: GridBox,
    pendingBox: GridBox,
  ): void {
    boxPreviewPass.draw(encoder, accumView(), view, builtBox, pendingBox);
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
    volpathPass?.dispose();
    volpathPass = null;
    splatPass?.dispose();
    splatPass = null;
    galaxyOverlayPass?.dispose();
    galaxyOverlayPass = null;
    boxPreviewPass.dispose();
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
    clear,
    attachTrace,
    drawTrace,
    attachVolpath,
    drawVolpath,
    resetVolpath,
    attachAgents,
    drawSplat,
    drawGalaxyOverlay,
    drawBoxPreview,
    tonemap,
    dispose,
  };
}

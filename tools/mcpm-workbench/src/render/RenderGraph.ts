/**
 * createRenderGraph — the HDR-accumulate → tonemap stage (same shape as
 * tools/flow-workbench's): it owns the shared `rgba16float` accum texture every
 * MCPM layer draws into and the fullscreen tonemap that resolves it to the
 * swap-chain. No layer clears: `clear()` opens the frame, then any subset of
 * `drawTrace` / `drawSplat` / `drawGalaxyOverlay` / `drawVolpath` / `drawBoxPreview`
 * (last, so its wireframe sits over the galaxy dots) loads and blends one/one onto
 * it, in that order. A pass constructed but never registered here is silently
 * never opened. `accumView()` is a method, not a field — the texture is rebuilt on
 * resize, so a cached view would dangle.
 */
import type { AgentBuffers } from '../../@types/AgentBuffers';
import type { GizmoHandleId } from '../../@types/GizmoHandleId';
import type { GridBox } from '../../@types/GridBox';
import { createBoxPreviewPass, type BoxPreviewPass } from './boxPreviewPass';
import type { GalaxyOverlayOptions, GalaxyOverlayPass } from './galaxyOverlayPass';
import { createGalaxyOverlayPass } from './galaxyOverlayPass';
import { reducedTraceSize } from './reducedTraceSize';
import type { SplatPass, SplatView } from './splatPass';
import { createSplatPass } from './splatPass';
import type { TracePass, TraceSource, TraceView } from './tracePass';
import { createTracePass } from './tracePass';
import type { VolpathParams, VolpathPass } from './volpathPass';
import { createVolpathPass } from './volpathPass';
import type { McpmCameraView } from './writeMcpmCamera';
import blitWgsl from './shaders/blit.wesl?static';
import mcpmVertexWgsl from '../../../../src/services/gpu/shaders/mcpm/vertex.wesl?static';
import traceUpsampleWgsl from '../../../../src/services/gpu/shaders/mcpm/traceUpsample.wesl?static';

const HDR_FORMAT: GPUTextureFormat = 'rgba16float';

// One/one premultiplied, every LIGHT-EMITTING layer: the graph owns the clear, each pass
// LOADs and adds. Fifth copy of this literal was the trigger (tracePass, splatPass,
// galaxyOverlayPass, volpathPass, boxPreviewPass) — an omitted blend REPLACES everything
// drawn beneath it instead of adding to it, alpha lane included, so a layer that forgets
// this errors loud (missing import) rather than silently wiping the frame. The one
// exception is boxPreviewPass (OVERLAY_BLEND, below): it's a UI overlay, not a light
// emitter, so it must stay visible over a bright raymarch instead of washing out into it.
export const LAYER_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
};

// Premultiplied-over, for the gizmo/wireframe overlay only: with fragment alpha 1.0 (opaque
// glyphs/lines — see boxLines.wesl's fs/fsGlyph) this REPLACES the destination pixel instead
// of adding to it, so the gizmo stays legible over a bright raymarch region instead of
// blowing out additively.
export const OVERLAY_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
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
  /**
   * March the attached trace pass into the accum target, at `divisor` (view.raymarch.divisor
   * — see drawTracePass). Throws if none is attached.
   */
  drawTrace(encoder: GPUCommandEncoder, view: TraceView, divisor: number): void;
  /**
   * March ANY `TracePass` — the attached live one or the attached preview one — through
   * the same divisor path (drawTrace/drawPreviewTrace are both thin wrappers over this).
   * `divisor` is a parameter, not a TraceView field: TraceView mirrors the fragment
   * shader's own uniform byte-for-byte (VIEW_UNIFORM_BYTES), and the shader carries no
   * screen-size uniform to receive it. `divisor <= 1` draws straight into the accum
   * target; `divisor > 1` draws into a shared `floor(size/divisor)` target (reducedTraceSize),
   * cleared to a=0 first, then upsamples it into the accum target with LAYER_BLEND — same
   * shape as the main app's `volume` render-target row.
   */
  drawTracePass(
    encoder: GPUCommandEncoder,
    pass: TracePass,
    view: TraceView,
    divisor: number,
  ): void;
  /**
   * The T18 preview-export view: builds a TracePass over a packed-cube buffer. Viewport
   * builds the buffer itself via `previewPackedTrace.ts` and owns its lifetime/disposal.
   * Same shape as `attachTrace`; replaces and disposes any preview pass attached before.
   */
  attachPreviewTrace(source: TraceSource): void;
  /** True once `attachPreviewTrace` has built a pass that hasn't since been disposed. */
  hasPreviewTrace(): boolean;
  /**
   * March the attached preview pass through the same divisor path as `drawTrace`.
   * Throws if none is attached — callers check `hasPreviewTrace()` first.
   */
  drawPreviewTrace(encoder: GPUCommandEncoder, view: TraceView, divisor: number): void;
  /**
   * Drop the preview pass early — toggle-off, staleness, or a failed rebuild — without
   * waiting for the next `attachPreviewTrace` or a full graph `dispose()`; a no-op before
   * `attachPreviewTrace`. `dispose()` also calls this.
   */
  disposePreviewTrace(): void;
  /**
   * Build the path tracer over `source` — the same `TraceSource` `attachTrace` takes, so
   * both passes are attached together in `attachTrace`'s caller. Replaces and disposes any
   * pass attached before.
   */
  attachVolpath(source: TraceSource): void;
  /**
   * Accumulate one path-traced sample per pixel and resolve, at `divisor` (view.pathTracer's
   * EFFECTIVE divisor — see effectiveVolpathDivisor.ts, Viewport's own concern, not this
   * graph's). Throws if none is attached.
   */
  drawVolpath(
    encoder: GPUCommandEncoder,
    view: McpmCameraView,
    params: VolpathParams,
    divisor: number,
  ): void;
  /** Drop the path tracer's accumulated samples; a no-op before `attachVolpath`. */
  resetVolpath(): void;
  /**
   * Build the two agent-fed layers — the swarm splat over `agents` (box-culled, the sim's
   * own set) and the galaxy points over `overlayAgents` (task S16: the RAW loaded set,
   * the overlay's own lanes). Both die with their harness, so this is re-called on every
   * rebuild.
   */
  attachAgents(agents: AgentBuffers, overlayAgents: AgentBuffers, box: GridBox): void;
  /** Splat the free agents onto whatever is already in the accum target. */
  drawSplat(encoder: GPUCommandEncoder, view: SplatView): void;
  /** Dot the catalog points onto whatever is already in the accum target. */
  drawGalaxyOverlay(
    encoder: GPUCommandEncoder,
    view: McpmCameraView,
    options: GalaxyOverlayOptions,
  ): void;
  /**
   * Wireframe `pendingBox` (converted into `builtBox`'s voxel frame) plus its gizmo handle
   * glyphs, over whatever is already in the accum target — drawn last so it sits over the
   * galaxy dots. `hoverHandle`/`activeHandle` pick the glyph highlight color (null for
   * neither); Viewport.tsx wires them in F1.5.
   */
  drawBoxPreview(
    encoder: GPUCommandEncoder,
    view: McpmCameraView,
    builtBox: GridBox,
    pendingBox: GridBox,
    hoverHandle: GizmoHandleId | null,
    activeHandle: GizmoHandleId | null,
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

  // The trace-preview upsample (drawTracePass, divisor > 1) — built eagerly, same
  // reasoning as boxPreviewPass below: it needs no harness to compile, so a broken
  // traceUpsample.wesl fails at boot rather than the first time someone raises the
  // divisor slider. Explicit layout, never 'auto' — group(0): the reduced target's
  // texture + a linear sampler, nothing else.
  const traceUpsampleVertexModule = makeShader(mcpmVertexWgsl, 'mcpm-trace-upsample-vertex');
  const traceUpsampleFragmentModule = makeShader(traceUpsampleWgsl, 'mcpm-trace-upsample-fragment');
  const traceUpsampleLayout = device.createBindGroupLayout({
    label: 'mcpm-trace-upsample-layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });
  const traceUpsamplePipeline = device.createRenderPipeline({
    label: 'mcpm-trace-upsample',
    layout: device.createPipelineLayout({
      label: 'mcpm-trace-upsample-pipeline-layout',
      bindGroupLayouts: [traceUpsampleLayout],
    }),
    vertex: { module: traceUpsampleVertexModule, entryPoint: 'vs' },
    fragment: {
      module: traceUpsampleFragmentModule,
      entryPoint: 'fs',
      targets: [{ format: HDR_FORMAT, blend: LAYER_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });
  const traceUpsampleSampler = device.createSampler({
    label: 'mcpm-trace-upsample-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  let curWidth = 0;
  let curHeight = 0;
  let accumTex: GPUTexture | null = null;
  let accumTexView: GPUTextureView | null = null;
  let blitBindGroup: GPUBindGroup | null = null;
  let tracePass: TracePass | null = null;
  // T18's preview-export pass (task R7): built by attachPreviewTrace over the packed-cube
  // buffer Viewport hands in, disposed early on toggle-off/staleness (disposePreviewTrace)
  // or wholesale with the rest of the graph (dispose()) — never both `tracePass` and this
  // one drawn in the same frame (drawTracePass's own doc comment on `reducedTex` below).
  let previewTracePass: TracePass | null = null;
  let volpathPass: VolpathPass | null = null;
  let splatPass: SplatPass | null = null;
  let galaxyOverlayPass: GalaxyOverlayPass | null = null;
  // The shared offscreen trace target (drawTracePass, divisor > 1) — one texture reused
  // by whichever pass draws this frame (the live trace or T18's previewPass; never both
  // in the same frame). `reducedDivisor` starts at 0 (not 1) so the FIRST divisor-1 frame
  // still skips allocating it — the lazy check in drawTracePass below never runs for
  // divisor <= 1, so this trio only ever gets built once something actually needs it.
  let reducedTex: GPUTexture | null = null;
  let reducedView: GPUTextureView | null = null;
  let reducedWidth = 0;
  let reducedHeight = 0;
  let reducedDivisor = 0;
  let traceUpsampleBindGroup: GPUBindGroup | null = null;
  // Eager, not lazy like the agent-fed passes above (attachTrace/attachAgents, called
  // once the harness exists): it needs neither the harness nor a box to compile, so
  // building it here (graph construction) is what makes a broken boxLines.wesl fail at
  // boot instead of surviving until someone drags a grid-box slider. This is about
  // WITHIN one graph's construction, not across rebuilds — createRenderGraph itself runs
  // inside watchSceneSaga's build, so every pass here, this one included, is torn
  // down and rebuilt with the rest of the graph on every harness rebuild.
  const boxPreviewPass: BoxPreviewPass = createBoxPreviewPass({
    device,
    targetFormat: HDR_FORMAT,
    blend: OVERLAY_BLEND,
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

  function drawTrace(encoder: GPUCommandEncoder, view: TraceView, divisor: number): void {
    if (!tracePass) {
      throw new Error('RenderGraph.drawTrace: call attachTrace() before drawing the raymarch');
    }
    drawTracePass(encoder, tracePass, view, divisor);
  }

  /** (Re)build the shared reduced target iff its size or divisor changed since last call —
   * see the module-scope `reduced*` vars above for why this is lazy, not resize()-driven. */
  function ensureReducedTraceTarget(divisor: number): void {
    const { width, height } = reducedTraceSize(curWidth, curHeight, divisor);
    if (
      width === reducedWidth &&
      height === reducedHeight &&
      divisor === reducedDivisor &&
      reducedTex
    ) {
      return;
    }
    reducedWidth = width;
    reducedHeight = height;
    reducedDivisor = divisor;

    reducedTex?.destroy();
    reducedTex = device.createTexture({
      label: 'mcpm-trace-reduced',
      size: { width, height },
      format: HDR_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    reducedView = reducedTex.createView();
    traceUpsampleBindGroup = device.createBindGroup({
      label: 'mcpm-trace-upsample',
      layout: traceUpsampleLayout,
      entries: [
        { binding: 0, resource: reducedView },
        { binding: 1, resource: traceUpsampleSampler },
      ],
    });
  }

  function drawTracePass(
    encoder: GPUCommandEncoder,
    pass: TracePass,
    view: TraceView,
    divisor: number,
  ): void {
    if (divisor <= 1) {
      pass.draw(encoder, accumView(), view);
      return;
    }
    // resize() runs before any layer draws each frame (Viewport's frame()), so
    // curWidth/curHeight are already this frame's drawable — safe to size off here
    // rather than threading divisor through resize() itself, which every OTHER layer
    // (splat, galaxy overlay, volpath) has no use for.
    ensureReducedTraceTarget(divisor);
    if (!reducedView || !traceUpsampleBindGroup) {
      throw new Error('RenderGraph.drawTracePass: reduced target was not built');
    }
    // Cleared every frame it's used (unlike accumView(), which the graph clears once):
    // an untouched texel must contribute nothing to the upsample's additive blend below.
    const reducedClear = encoder.beginRenderPass({
      label: 'mcpm-trace-reduced-clear',
      colorAttachments: [
        {
          view: reducedView,
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          storeOp: 'store',
        },
      ],
    });
    reducedClear.end();
    pass.draw(encoder, reducedView, view);

    const upsample = encoder.beginRenderPass({
      label: 'mcpm-trace-upsample',
      colorAttachments: [{ view: accumView(), loadOp: 'load', storeOp: 'store' }],
    });
    upsample.setPipeline(traceUpsamplePipeline);
    upsample.setBindGroup(0, traceUpsampleBindGroup);
    upsample.draw(3);
    upsample.end();
  }

  function attachPreviewTrace(source: TraceSource): void {
    previewTracePass?.dispose();
    previewTracePass = createTracePass({
      device,
      targetFormat: HDR_FORMAT,
      blend: LAYER_BLEND,
      makeShader,
      source,
    });
  }

  function hasPreviewTrace(): boolean {
    return previewTracePass !== null;
  }

  function drawPreviewTrace(encoder: GPUCommandEncoder, view: TraceView, divisor: number): void {
    if (!previewTracePass) {
      throw new Error(
        'RenderGraph.drawPreviewTrace: call attachPreviewTrace() before drawing the preview',
      );
    }
    drawTracePass(encoder, previewTracePass, view, divisor);
  }

  function disposePreviewTrace(): void {
    previewTracePass?.dispose();
    previewTracePass = null;
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
    divisor: number,
  ): void {
    if (!volpathPass) {
      throw new Error('RenderGraph.drawVolpath: call attachVolpath() before drawing');
    }
    volpathPass.draw(encoder, accumView(), view, params, divisor);
  }

  function resetVolpath(): void {
    volpathPass?.reset();
  }

  function attachAgents(agents: AgentBuffers, overlayAgents: AgentBuffers, box: GridBox): void {
    splatPass?.dispose();
    galaxyOverlayPass?.dispose();
    const shared = { device, targetFormat: HDR_FORMAT, blend: LAYER_BLEND, makeShader, box };
    splatPass = createSplatPass({ ...shared, agents });
    galaxyOverlayPass = createGalaxyOverlayPass({ ...shared, agents: overlayAgents });
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
    hoverHandle: GizmoHandleId | null,
    activeHandle: GizmoHandleId | null,
  ): void {
    boxPreviewPass.draw(
      encoder,
      accumView(),
      view,
      builtBox,
      pendingBox,
      hoverHandle,
      activeHandle,
    );
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
    disposePreviewTrace();
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
    reducedTex?.destroy();
    reducedTex = null;
    reducedView = null;
    reducedWidth = 0;
    reducedHeight = 0;
    reducedDivisor = 0;
    traceUpsampleBindGroup = null;
  }

  return {
    hdrFormat: HDR_FORMAT,
    accumView,
    resize,
    clear,
    attachTrace,
    drawTrace,
    drawTracePass,
    attachPreviewTrace,
    hasPreviewTrace,
    drawPreviewTrace,
    disposePreviewTrace,
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

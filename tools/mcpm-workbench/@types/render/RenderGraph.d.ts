import type { AgentBuffers } from '../sim/AgentBuffers';
import type { GizmoHandleId } from '../gizmo/GizmoHandleId';
import type { GridBox } from '../grid/GridBox';
import type { GalaxyOverlayOptions } from '../../src/render/passes/galaxyOverlayPass';
import type { SplatView } from '../../src/render/passes/splatPass';
import type { TracePass, TraceSource, TraceView } from '../../src/render/passes/tracePass';
import type { VolpathParams } from '../../src/render/passes/volpathPass';
import type { McpmCameraView } from './camera/McpmCameraView';

export type RenderGraph = {
  /** The HDR accumulation format every layer's pipeline must target ('rgba16float'). */
  readonly hdrFormat: GPUTextureFormat;
  /** The current HDR target view. A method (not a field): the texture is rebuilt on resize. */
  accumView(): GPUTextureView;
  /** Recreate the accum texture + blit bind group iff the drawable size changed. */
  resize(width: number, height: number): void;
  /**
   * Black out the accum target. Every frame opens with this, whether or not a layer
   * follows: with no scene to draw the tonemap would otherwise resolve last frame's pixels.
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

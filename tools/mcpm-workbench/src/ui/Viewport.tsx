/**
 * Viewport — owns the <canvas>, the McpmHarness, the render graph and the RAF
 * loop; bridges pointer/wheel input into the view slice's orbit camera.
 *
 * `createMcpmHarness` is the ONLY caller of `initGpu` (it asks for shader-f16 and
 * the kernels' compute limits); a second call here would race another device onto
 * the same canvas. Every rebuild — catalog reload or structural — goes through
 * `requestBuild`, which serialises on `buildGeneration`: one in flight, latest
 * config wins, a request arriving mid-build served on completion, not dropped.
 * Only structural changes are debounced; params, run tokens and camera are live.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import type { AgentWeights } from '../../@types/AgentWeights';
import type { AppState } from '../../@types/AppState';
import type { CatalogPoints } from '../../@types/CatalogPoints';
import type { GizmoDragState } from '../../@types/GizmoDragState';
import type { GizmoHandleId } from '../../@types/GizmoHandleId';
import type { GridBox } from '../../@types/GridBox';
import type { McpmHarness } from '../../@types/McpmHarness';
import type { Ray } from '../../@types/Ray';
import type { Store } from '../../@types/Store';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../../src/@types/math/Vec4';
import { resizeCanvasToDisplay } from '../../../../src/services/gpu/device';
import { hasUrlGate } from '../../../../src/utils/url/hasUrlGate';
import { downloadStem } from '../export/downloadStem';
import { emitTraceSidecar } from '../export/emitTraceSidecar';
import { exportNpy } from '../export/exportNpy';
import { exportScfd } from '../export/exportScfd';
import { previewPackedTrace } from '../export/previewPackedTrace';
import { triggerDownload } from '../export/triggerDownload';
import { widenTrace } from '../export/widenTrace';
import { catalogBounds } from '../field/catalogBounds';
import { deriveAgentWeights } from '../field/deriveAgentWeights';
import { deriveGridBox } from '../field/deriveGridBox';
import { loadCatalogPoints } from '../field/loadCatalogPoints';
import { syntheticCatalog } from '../field/syntheticCatalog';
import { applyResizeDrag } from '../gizmo/applyResizeDrag';
import { applyTranslateDrag } from '../gizmo/applyTranslateDrag';
import { closestPointOnRayToLine } from '../gizmo/closestPointOnRayToLine';
import { dragRotate } from '../gizmo/dragRotate';
import { gizmoArrowLengthMpc } from '../gizmo/gizmoArrowLengthMpc';
import { gizmoHandleGeometry } from '../gizmo/gizmoHandleGeometry';
import { pickGizmoHandle } from '../gizmo/pickGizmoHandle';
import { screenToRay } from '../gizmo/screenToRay';
import { boxBasisVectors } from '../field/boxBasisVectors';
import { cameraBasis } from '../render/cameraBasis';
import { createRenderGraph, LAYER_BLEND, type RenderGraph } from '../render/RenderGraph';
import { createTracePass, type TracePass, type TraceView } from '../render/tracePass';
import type { McpmCameraView } from '../render/writeMcpmCamera';
import { createMcpmHarness } from '../sim/createMcpmHarness';
import { planGridBudget } from '../sim/planGridBudget';
import {
  setCatalogLoadStatus,
  setCatalogLoaded,
  setCatalogStatusMessage,
} from '../state/slices/catalogSlice';
import { buildKey } from '../state/buildKey';
import { gridShapeKeyFor } from '../state/gridShapeKeyFor';
import {
  setManualCenterMpc,
  setManualSizeMpc,
  setResolvedGrid,
  setRotation,
} from '../state/slices/gridSlice';
import { cross3 } from '../../../../src/utils/math/cross3';
import { multiplyQuat } from '../../../../src/utils/math/multiplyQuat';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { quatFromAxisAngle } from '../../../../src/utils/math/quatFromAxisAngle';
import { recordHistogramSample, resetHistogram } from '../state/slices/histogramSlice';
import { incrementStep, resetStepCount } from '../state/slices/simSlice';
import {
  defaultViewSlice,
  setCameraDistance,
  setCameraTarget,
  setCameraYawPitch,
  setFps,
  setPreviewPacked,
} from '../state/slices/viewSlice';

// The fork's ps_volume_trace multiplies fragment rgb by 2.0; the port dropped that,
// so exposure 2 reproduces it exactly through the blit.
const EXPOSURE = 2;
const CONTRAST = 1;
const REBUILD_DEBOUNCE_MS = 400;
// How long the pending-box wireframe stays up after the last grid-shaping change.
const BOX_PREVIEW_MS = 200;
// FPS badge throttle — pushing every frame would re-render the Hud at 60Hz.
const FPS_PUSH_INTERVAL_MS = 500;
// T20: the histogram PASS runs every step (encodeStep.ts) — cheap, only nDataPoints
// invocations do real work. What's worth throttling is the READBACK: mapAsync is a
// host round trip, and every sim step already queues one GPU submission of its own.
// Steps, not wall-clock, so the convergence plot's x-axis is exact step counts.
const HISTOGRAM_INTERVAL_STEPS = 20;
const DRAG_SPEED = 0.005;
// Exponential in the raw wheel delta — galaxy-renderer's createOrbitCameraInput
// constant, so both tools zoom with the same hand feel; a sign-only step ignores
// delta magnitude and crawls on trackpads.
const ZOOM_SPEED = 0.0018;
const PAN_SPEED = 0.0016;
const FOV_Y_RAD = Math.PI / 4;
const CAMERA_UP: Vec3 = [0, 1, 0];

const canvasStyle: CSSProperties = { display: 'block', width: '100vw', height: '100vh' };

/** `?probe`-gated boot signal: probeGpuErrors.ts has no React tree to observe, so it polls this instead of racing the HUD's own text. */
type ProbeWindow = { __mcpmProbeReady?: boolean };

/**
 * `packedDropId`/`packedSourceName` stand in for the dropped catalog's
 * identity — cheap to JSON.stringify every store notification (incl. every
 * running-sim frame), where the override's own Float32Arrays would not be.
 * The id (not the name alone) is what actually triggers a rebuild: the
 * fork exports its packed catalog under the same default filename on every
 * run, so re-dropping a regenerated file — the realistic repeat workflow —
 * would leave a name-only key unchanged and silently starve the reload.
 */
function catalogKey(s: AppState): unknown[] {
  return [s.catalog.sources, s.catalog.tier, s.catalog.packedDropId, s.catalog.packedSourceName];
}

/** The one camera every view resolves from: an overlay off by a frame's basis is a lie. */
function cameraViewFor(s: AppState, viewportPx: readonly [number, number]): McpmCameraView {
  const { yaw, pitch, distance, targetMpc } = s.view.camera;
  const cosPitch = Math.cos(pitch);
  const eyeMpc: Vec3 = [
    targetMpc[0] + distance * cosPitch * Math.sin(yaw),
    targetMpc[1] + distance * Math.sin(pitch),
    targetMpc[2] + distance * cosPitch * Math.cos(yaw),
  ];
  return { eyeMpc, targetMpc, upMpc: CAMERA_UP, fovYRad: FOV_Y_RAD, viewportPx };
}

function traceViewFor(s: AppState, box: GridBox, cam: McpmCameraView): TraceView {
  return {
    eyeMpc: cam.eyeMpc,
    targetMpc: cam.targetMpc,
    upMpc: cam.upMpc,
    fovYRad: cam.fovYRad,
    aspect: cam.viewportPx[0] / cam.viewportPx[1],
    trimDensity: s.view.raymarch.trimDensity,
    sampleWeight: s.view.raymarch.sampleWeight,
    opticalThickness: s.view.raymarch.opticalThickness,
    stepVoxels: s.view.raymarch.stepVoxels,
    additive: s.view.raymarch.additive,
    // Scaled to the grid AND the step length, never fixed: the box diagonal is longer
    // than any axis, and sub-1 stepVoxels needs proportionally more steps — a bound
    // short of the crossing truncates the march silently, with no visual cue that it did.
    maxSteps: Math.ceil(
      (2 * Math.max(box.dims[0], box.dims[1], box.dims[2])) /
        Math.max(s.view.raymarch.stepVoxels, 0.25),
    ),
  };
}

export type ViewportProps = {
  readonly store: Store<AppState>;
};

/** Narrows away GizmoDragState's rotate variant — nested on `handle.kind`, one level past
 *  what TS's discriminated-union narrowing follows automatically, so an explicit predicate
 *  earns its place here rather than a cast at each call site. */
type AxisDragState = Extract<
  GizmoDragState,
  { readonly handle: { readonly kind: 'translate' | 'resize' } }
>;
function isAxisDrag(drag: GizmoDragState): drag is AxisDragState {
  return drag.handle.kind !== 'rotate';
}

/** boxBasisVectors' named triplet, reshaped into gizmoHandleGeometry's `axes` tuple — F2.5's
 *  axes swap: every gizmo call site feeds the box's OWN rotated axes now, not world UNIT_AXES,
 *  so arrows/crosses/rings all rotate with the box (same reshape boxPreviewPass.ts applies). */
function axesFor(rotation: Readonly<Vec4>): readonly [Vec3, Vec3, Vec3] {
  const basis = boxBasisVectors(rotation);
  return [basis.x, basis.y, basis.z];
}

/** A unit vector ⊥ `axisDir` — the rotate ring's 0°-angle reference for `dragRotate`. Same
 *  "helper axis not near-parallel" fallback as cameraBasis.ts's right/up derivation and
 *  boxPreviewPass.ts's crossArmVectors — deterministic in axisDir alone, so calling it fresh at
 *  pointer-down and every pointer-move yields the SAME reference `dragRotate`'s absolute-angle
 *  anchor/current pair needs, with no state to carry between calls. */
function ringReferenceDirFor(axisDir: Readonly<Vec3>): Vec3 {
  const helper: Vec3 = Math.abs(axisDir[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  return normalize3(cross3(axisDir, helper));
}

function Viewport({ store }: ViewportProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    // Re-typed (not just narrowed) so nested closures below don't need to
    // re-check nullability — TS doesn't carry a `const` narrowing across a
    // function-declaration boundary the way it does for arrow functions.
    const canvas: HTMLCanvasElement = canvasEl;

    let disposed = false;
    let rafHandle = 0;
    let rebuildTimer = 0;
    let harness: McpmHarness | null = null;
    let renderGraph: RenderGraph | null = null;
    let points: CatalogPoints | null = null;
    // The T16 export leg's other half of buildFromPoints' local `weights` —
    // held here so runExport (below) can reach the SAME weights the running
    // harness was seeded with, not a freshly re-derived copy.
    let latestWeights: AgentWeights | null = null;
    let loadedCatalogKey = '';
    // REQUESTED, not "last built": the frame loop notifies this subscriber every
    // frame (the step counter is store state), so the guard has to compare against
    // what a build was last asked for or every frame would request another one.
    let requestedCatalogKey = JSON.stringify(catalogKey(store.getSnapshot()));
    let requestedBuildKey = JSON.stringify(buildKey(store.getSnapshot()));
    let buildGeneration = 0;
    let building = false;
    let lastResetToken = store.getSnapshot().sim.resetToken;
    let lastClearToken = store.getSnapshot().sim.clearTraceToken;
    let lastExportToken = store.getSnapshot().sim.exportToken;
    let lastScfdToken = store.getSnapshot().sim.scfdToken;
    let lastGridShapeKey = JSON.stringify(gridShapeKeyFor(store.getSnapshot()));
    let boxPreviewUntil = 0;
    // T18 preview-export view: a second TracePass over a packed-cube buffer,
    // built once per false→true edge of `view.raymarch.previewPacked` (see the
    // subscriber below) rather than every frame. `previewPackedAtStep` is the
    // `sim.stepCount` snapshot taken the moment the pack landed; frame() drops
    // back to the live trace once `stepCount` moves past it (spec's "STALE").
    let previewPass: TracePass | null = null;
    let previewBuffer: GPUBuffer | null = null;
    let previewPackedAtStep = -1;
    let lastPreviewPacked = store.getSnapshot().view.raymarch.previewPacked;
    // T20: jittered-position samples and data-point samples are differently-defined
    // statistics under the same `meanLogTraceAtPoints` name — every toggle edge clears
    // `history` (below) so the two never ride the same convergence curve.
    let lastSampleRandomly = store.getSnapshot().histogram.sampleRandomly;
    // null whenever the path tracer is off — reaching this frame with the layer freshly
    // turned on always differs from null, so enabling it always resets, per the
    // accumulation contract (task-V2A-report.md).
    let lastVolpathKey: string | null = null;
    // -1 sentinel: skips the first frame's delta, which spans the async catalog
    // load + harness build and would otherwise seed the EMA with a huge bogus dt.
    let lastFrameTime = -1;
    let fpsEma = 0;
    let lastFpsPushTime = 0;
    let lastPushedFps = 0;
    // Guards against overlapping readbacks: a mapAsync round trip can outlive the next
    // throttle boundary on a slow device, and stacking calls would only queue more of
    // the same expensive wait.
    let histogramInFlight = false;

    /** Frees the T18 preview pass + its packed buffer. Idempotent. */
    function disposePreview(): void {
      previewPass?.dispose();
      previewPass = null;
      previewBuffer?.destroy();
      previewBuffer = null;
    }

    function disposeHarness(): void {
      disposePreview();
      renderGraph?.dispose();
      renderGraph = null;
      harness?.dispose();
      harness = null;
    }

    /**
     * T16 export leg: readback → `.npy` + `polyphy-trace` sidecar from one
     * `downloadStem`, both via `triggerDownload`. `readbackTrace` refuses
     * by name (over `maxBufferSize`) rather than throwing mid-copy, but
     * either way a failure here must not reach the caller — it runs off
     * the store subscriber, not inside the rAF `frame()` loop, so an
     * unhandled rejection would only be a silent console error, not a
     * dead loop; caught explicitly anyway so the failure reads as an
     * export-specific message, not a generic unhandled-rejection trace.
     */
    async function runExport(): Promise<void> {
      const h = harness;
      const pts = points;
      const weights = latestWeights;
      if (!h || !pts || !weights) return;
      const s = store.getSnapshot();
      try {
        const readback = await h.readbackTrace();
        const stem = downloadStem(new Date());
        triggerDownload(`${stem}.npy`, exportNpy(readback), 'application/octet-stream');
        const sidecar = emitTraceSidecar({
          box: h.box,
          points: pts,
          weights,
          tier: s.catalog.tier,
          params: s.sim.params,
          agentCount: s.sim.agentCount,
          steps: s.sim.stepCount,
          seed: s.sim.seed,
          producedAt: new Date(),
        });
        triggerDownload(`${stem}.json`, sidecar, 'application/json');
      } catch (err) {
        console.error('mcpm-workbench: export failed', err);
      }
    }

    /**
     * T17 leg 2: readback → widen → `.scfd`, through the SAME
     * `packLogTraceVoxels`/`encodeScalarField` the offline `buildRhizomeVolume`
     * importer runs, so the two outputs are diffable. Same refusal contract
     * as `runExport` above — caught here so it can never kill the rAF loop.
     */
    async function runScfdExport(): Promise<void> {
      const h = harness;
      if (!h) return;
      try {
        const readback = await h.readbackTrace();
        const values = widenTrace(readback);
        const scfd = exportScfd(values, h.box);
        const stem = downloadStem(new Date());
        triggerDownload(`${stem}.scfd`, scfd, 'application/octet-stream');
      } catch (err) {
        console.error('mcpm-workbench: scfd export failed', err);
      }
    }

    /**
     * T18: readback → widen → `previewPackedTrace` (the REAL packLogTraceVoxels,
     * `runScfdExport`'s own call) → a second TracePass over the packed buffer,
     * in place of RenderGraph's live one. Runs once per toggle-on; frame()
     * below is what decides every frame whether the result is still fresh
     * enough to draw. `harness !== h` guards the rebuild race the same way
     * `buildFromPoints` guards `generation` — `readbackTrace` can outlive a
     * catalog switch that starts mid-await. The `previewPacked` re-check
     * guards a second race the token-diff style above doesn't: the user can
     * uncheck before this lands, and only the flag at COMMIT time (not at
     * call time) says whether the result is still wanted — skip installing
     * rather than build-then-dispose, so nothing orphaned is ever created.
     */
    async function runPreviewPacked(): Promise<void> {
      const h = harness;
      const graph = renderGraph;
      if (!h || !graph) return;
      try {
        const readback = await h.readbackTrace();
        const values = widenTrace(readback);
        if (disposed || harness !== h) return;
        if (!store.getSnapshot().view.raymarch.previewPacked) return;
        disposePreview();
        const packed = previewPackedTrace(h.gpu.device, values, h.box);
        previewBuffer = packed.buffer;
        previewPass = createTracePass({
          device: h.gpu.device,
          targetFormat: graph.hdrFormat,
          blend: LAYER_BLEND,
          makeShader: (code, label) => h.gpu.device.createShaderModule({ code, label }),
          source: {
            traceBuffer: packed.buffer,
            box: h.box,
            element: packed.element,
            paletteId: store.getSnapshot().view.raymarch.paletteId,
          },
        });
        previewPackedAtStep = store.getSnapshot().sim.stepCount;
      } catch (err) {
        console.error('mcpm-workbench: preview packed trace failed', err);
        disposePreview();
        store.setState((st) => ({ ...st, view: setPreviewPacked(st.view, false) }));
      }
    }

    /**
     * T20: throttled histogram readback (HISTOGRAM_INTERVAL_STEPS above) — reads back
     * whatever `step()`'s last dispatch left in the histogram counts + densities
     * buffers and derives `meanLogTraceAtPoints` from it. `harness !== h` guards the
     * same rebuild race `runPreviewPacked` does: a catalog switch can land mid-await.
     */
    async function runHistogram(h: McpmHarness, stepCount: number): Promise<void> {
      if (histogramInFlight) return;
      histogramInFlight = true;
      try {
        const { counts, sampledCount, densities } = await h.readHistogram();
        if (disposed || harness !== h) return;
        store.setState((st) => ({
          ...st,
          histogram: recordHistogramSample(
            st.histogram,
            counts,
            sampledCount,
            densities,
            stepCount,
          ),
        }));
      } catch (err) {
        console.error('mcpm-workbench: histogram readback failed', err);
      } finally {
        histogramInFlight = false;
      }
    }

    function startLoop(): void {
      if (rafHandle) cancelAnimationFrame(rafHandle);
      // Re-seed the FPS sentinels exactly as their declarations do: every rebuild tears
      // the loop down and restarts it here, and without this reset the first frame back
      // would blend the multi-second build gap into the EMA as a ~5fps reading.
      lastFrameTime = -1;
      fpsEma = 0;
      lastFpsPushTime = 0;
      lastPushedFps = 0;
      const frame = (): void => {
        if (disposed || !harness || !renderGraph) return;
        rafHandle = requestAnimationFrame(frame);
        const h = harness;
        const graph = renderGraph;

        const s = store.getSnapshot();
        if (s.sim.running) {
          h.step(s.sim.params, s.histogram.sampleRandomly);
          const nextStepCount = s.sim.stepCount + 1;
          store.setState((st) => ({ ...st, sim: incrementStep(st.sim) }));
          if (nextStepCount % HISTOGRAM_INTERVAL_STEPS === 0) void runHistogram(h, nextStepCount);
        }

        const now = performance.now();
        if (lastFrameTime >= 0) {
          const dt = now - lastFrameTime;
          fpsEma = fpsEma === 0 ? dt : fpsEma * 0.9 + dt * 0.1;
          if (fpsEma > 0 && now - lastFpsPushTime >= FPS_PUSH_INTERVAL_MS) {
            const fpsRounded = Math.round(1000 / fpsEma);
            if (fpsRounded !== lastPushedFps) {
              lastPushedFps = fpsRounded;
              store.setState((st) => ({ ...st, view: setFps(st.view, fpsRounded) }));
            }
            lastFpsPushTime = now;
          }
        }
        lastFrameTime = now;

        const gridShapeKey = JSON.stringify(gridShapeKeyFor(s));
        if (gridShapeKey !== lastGridShapeKey) {
          lastGridShapeKey = gridShapeKey;
          boxPreviewUntil = now + BOX_PREVIEW_MS;
        }

        resizeCanvasToDisplay(canvas);
        graph.resize(canvas.width, canvas.height);

        const encoder = h.gpu.device.createCommandEncoder({ label: 'mcpm-workbench-frame' });
        const cam = cameraViewFor(s, [canvas.width, canvas.height]);
        // Independent layers over one clear, back to front. The clear is unconditional:
        // with every layer off the frame is black, not last frame's pixels.
        const { layers } = s.view;
        graph.clear(encoder);
        if (layers.raymarch) {
          // T18: previewPacked wants the packed cube, but only while it is still
          // the pack of THIS stepCount — a sim step invalidates it (spec's
          // "STALE"), and the fallback IS the live trace, not a blank frame.
          if (
            s.view.raymarch.previewPacked &&
            previewPass &&
            previewPackedAtStep === s.sim.stepCount
          ) {
            // Routed through drawTracePass (not previewPass.draw directly) so the
            // divisor preview applies identically here — same reduced target, same
            // upsample, no special-casing for the packed source.
            graph.drawTracePass(
              encoder,
              previewPass,
              traceViewFor(s, h.box, cam),
              s.view.raymarch.divisor,
            );
          } else {
            if (s.view.raymarch.previewPacked && previewPass) {
              disposePreview();
              store.setState((st) => ({ ...st, view: setPreviewPacked(st.view, false) }));
            }
            graph.drawTrace(encoder, traceViewFor(s, h.box, cam), s.view.raymarch.divisor);
          }
        }
        if (layers.agents) {
          graph.drawSplat(encoder, {
            ...cam,
            sampleWeight: s.view.raymarch.sampleWeight,
            intensity: s.view.agents.intensity,
            pointSizePx: s.view.agents.pointSizePx,
          });
        }
        if (layers.galaxies) graph.drawGalaxyOverlay(encoder, cam, s.view.galaxies);
        if (layers.pathTracer) {
          // Reset on any camera move, any pathTracer param change, or an explicit
          // clear-trace/reset command — `cam` is the SAME serialized object already
          // computed above, so this can't drift from what actually drew. Deliberately
          // NOT keyed on `sim.stepCount`: an earlier version floored a step term in here
          // so a running sim wiped the accumulator every 16 steps instead of every
          // frame — still a periodic full-wipe, visible as never converging. The field
          // drifts slowly enough (same reasoning that justified the 16-step floor) that
          // letting samples ride across steps indefinitely is fine; a box change that
          // actually invalidates the grid reaches here through a harness rebuild instead
          // (buildFromPoints resets `lastVolpathKey` to null there).
          const volpathKey = JSON.stringify([
            cam,
            s.view.pathTracer,
            s.sim.clearTraceToken,
            s.sim.resetToken,
          ]);
          if (volpathKey !== lastVolpathKey) graph.resetVolpath();
          lastVolpathKey = volpathKey;
          graph.drawVolpath(encoder, cam, s.view.pathTracer);
        } else {
          lastVolpathKey = null;
        }
        // The pending box leads the debounced harness rebuild by up to REBUILD_DEBOUNCE_MS —
        // that lead is the point, live tuning ahead of the rebuild landing. Drawn last, over
        // the galaxy dots.
        // gizmoDragging keeps the wireframe up through a drag even once the 200ms
        // preview timer lapses — a continuous pointer signal is its own "still hot".
        // showGridBox (F1.7) ORs in a persistent third reason; see boxWireframeVisible.
        if (points && boxWireframeVisible(s, now)) {
          graph.drawBoxPreview(
            encoder,
            cam,
            h.box,
            deriveGridBox(s.grid),
            hoverHandle,
            gizmoDragging?.handle ?? null,
          );
        }
        graph.tonemap(encoder, h.gpu.context.getCurrentTexture().createView(), EXPOSURE, CONTRAST);
        h.gpu.device.queue.submit([encoder.finish()]);
      };
      rafHandle = requestAnimationFrame(frame);
    }

    async function buildFromPoints(pts: CatalogPoints, generation: number): Promise<void> {
      const s = store.getSnapshot();
      const weights = deriveAgentWeights(pts.log10StellarMass, s.catalog.weightMode);
      const boundsMpc = pts.count > 0 ? catalogBounds(pts.positions) : null;
      store.setState((st) => ({
        ...st,
        catalog: setCatalogLoaded(st.catalog, pts.count, weights.nanCount, boundsMpc),
      }));

      const box = deriveGridBox(s.grid);
      // Free the old device memory BEFORE allocating the new grids: the two sets of
      // buffers must never be resident together on a box-sized allocation.
      disposeHarness();
      if (disposed) return;

      const h = await createMcpmHarness({
        canvas,
        points: pts,
        weights,
        box,
        agentCount: s.sim.agentCount,
        initMode: s.sim.initMode,
        seed: s.sim.seed,
      });
      if (disposed || generation !== buildGeneration) {
        h.dispose();
        return;
      }
      harness = h;
      latestWeights = weights;
      lastResetToken = store.getSnapshot().sim.resetToken;
      lastClearToken = store.getSnapshot().sim.clearTraceToken;
      lastExportToken = store.getSnapshot().sim.exportToken;
      lastScfdToken = store.getSnapshot().sim.scfdToken;
      // disposeHarness() (above, via disposePreview()) already freed the old
      // preview pass/buffer; forcing the edge low re-packs against the fresh
      // harness on the subscriber's next tick, IF the toggle was left on.
      lastPreviewPacked = false;
      previewPackedAtStep = -1;

      // h.agents.nDataPoints, not pts.count: task S14 culls out-of-box catalog points
      // inside createMcpmHarness, so the harness's own buffer sizes (what this budget
      // must describe) are already smaller than the raw loaded count whenever the box
      // crops the catalog.
      const budget = planGridBudget(
        box,
        h.agents.nDataPoints + s.sim.agentCount,
        h.element,
        h.gpu.device.limits,
      );
      store.setState((st) => ({
        ...st,
        grid: setResolvedGrid(st.grid, box, h.element, budget),
        sim: resetStepCount(st.sim),
        // A new grid box / catalog never continues the old convergence curve — same
        // reasoning as the resetToken path below, same one-line fix.
        histogram: resetHistogram(st.histogram),
      }));

      const makeShader = (code: string, label: string): GPUShaderModule =>
        h.gpu.device.createShaderModule({ code, label });
      const graph = createRenderGraph(h.gpu.device, h.gpu.format, makeShader);
      // The trace buffer dies with its harness, so both passes reading it are
      // re-attached on every rebuild — a graph kept across one would march freed memory.
      const traceSource = {
        traceBuffer: h.traceBuffer,
        box,
        element: h.element,
        paletteId: s.view.raymarch.paletteId,
      };
      graph.attachTrace(traceSource);
      graph.attachVolpath(traceSource);
      graph.attachAgents(h.agents, h.overlayAgents, box);
      renderGraph = graph;
      // A fresh accumulator already clears on its own first draw (VolpathPass's
      // `pendingClear` starts true) — this just keeps the reset-tracking key from
      // outliving the harness it was computed against.
      lastVolpathKey = null;
      startLoop();
      if (hasUrlGate('probe')) (window as unknown as ProbeWindow).__mcpmProbeReady = true;
    }

    /** One build against the live snapshot, reloading the catalog only if its key moved. */
    async function buildOnce(generation: number): Promise<void> {
      const s = store.getSnapshot();
      const ck = JSON.stringify(catalogKey(s));
      try {
        if (!points || ck !== loadedCatalogKey) {
          store.setState((st) => ({ ...st, catalog: setCatalogLoadStatus(st.catalog, 'loading') }));
          // A dev-dropped packed catalog (App.tsx) wins outright — sticky for the
          // session, same as the doc comment on CatalogSlice's packedOverride field.
          // Otherwise `?probe` (probeGpuErrors.ts) swaps ONLY the next line — a
          // deterministic in-tool catalog instead of the network fetch — so the gate
          // never touches the network or `public/data` and every downstream pass
          // (grid fit, seeding, propagate/decay/raymarch) runs unmodified.
          const pts = s.catalog.packedOverride
            ? s.catalog.packedOverride
            : hasUrlGate('probe')
              ? syntheticCatalog()
              : await loadCatalogPoints(s.catalog.sources, s.catalog.tier);
          if (disposed || generation !== buildGeneration) return;
          points = pts;
          loadedCatalogKey = ck;
        }
        if (points.count === 0) {
          // Zero points is a real, reachable state (every selected source excluded
          // at this tier, or none selected) — not a crash: tear down any harness
          // left from a previous non-empty selection and surface a human status
          // instead of letting createMcpmHarness's own guard throw.
          disposeHarness();
          store.setState((st) => ({
            ...st,
            catalog: setCatalogStatusMessage(
              setCatalogLoaded(st.catalog, 0, 0, null),
              'no catalog points — enable a source or pick a tier that carries one',
            ),
          }));
          return;
        }
        await buildFromPoints(points, generation);
      } catch (err) {
        console.error('mcpm-workbench: build failed', err);
        if (!disposed) {
          store.setState((st) => ({ ...st, catalog: setCatalogLoadStatus(st.catalog, 'error') }));
        }
      }
    }

    /**
     * Serialised rebuild: one build in flight, latest config wins. The generation
     * bump is what makes a request arriving mid-build survive — the runner re-reads
     * it on completion and goes round again, where a boolean gate would drop it.
     */
    function requestBuild(): void {
      buildGeneration += 1;
      if (building) return;
      void (async () => {
        building = true;
        try {
          let served = -1;
          while (!disposed && served !== buildGeneration) {
            served = buildGeneration;
            await buildOnce(served);
          }
        } finally {
          building = false;
        }
      })();
    }

    requestBuild();

    const unsubscribe = store.subscribe(() => {
      if (disposed) return;
      const s = store.getSnapshot();

      const ck = JSON.stringify(catalogKey(s));
      const bk = JSON.stringify(buildKey(s));
      if (ck !== requestedCatalogKey) {
        requestedCatalogKey = ck;
        requestedBuildKey = bk;
        clearTimeout(rebuildTimer);
        requestBuild();
      } else if (bk !== requestedBuildKey) {
        // Debounced so typing into a grid-box field doesn't reallocate the GPU
        // buffers per keystroke; a catalog switch is a deliberate click, so it isn't.
        requestedBuildKey = bk;
        clearTimeout(rebuildTimer);
        rebuildTimer = window.setTimeout(requestBuild, REBUILD_DEBOUNCE_MS);
      }

      if (harness) {
        if (s.sim.resetToken !== lastResetToken) {
          lastResetToken = s.sim.resetToken;
          harness.reset(s.sim.initMode, s.sim.seed);
          // Old history entries would otherwise show larger step counts than the
          // freshly zeroed HUD counter — a convergence plot that looks like it jumped
          // backward in time.
          store.setState((st) => ({
            ...st,
            sim: resetStepCount(st.sim),
            histogram: resetHistogram(st.histogram),
            // Reset restores framing too, deliberately: the orbit target is absolute
            // world Mpc now (no longer box-relative), so nothing else recenters the
            // camera onto the box — this is the one recovery path for "camera drifted".
            view: { ...st.view, camera: defaultViewSlice.camera },
          }));
        }
        if (s.sim.clearTraceToken !== lastClearToken) {
          lastClearToken = s.sim.clearTraceToken;
          harness.clearTrace();
        }
        if (s.sim.exportToken !== lastExportToken) {
          lastExportToken = s.sim.exportToken;
          void runExport();
        }
        if (s.sim.scfdToken !== lastScfdToken) {
          lastScfdToken = s.sim.scfdToken;
          void runScfdExport();
        }
        // T20: jittered-position samples and data-point samples are differently-defined
        // statistics under the same name — a toggle mid-run must not interleave them
        // into one curve, so every edge clears history (and counts/mean) outright.
        if (s.histogram.sampleRandomly !== lastSampleRandomly) {
          lastSampleRandomly = s.histogram.sampleRandomly;
          store.setState((st) => ({ ...st, histogram: resetHistogram(st.histogram) }));
        }
        // T18: a boolean edge, not a token — ControlsPanel's checkbox already
        // IS the one-shot trigger (checking it twice without unchecking is a
        // no-op, unlike reset/export's repeatable click), and frame() above
        // owns the false transition it fires on staleness, so mirroring that
        // here too keeps a manual uncheck responsive without waiting a frame.
        if (s.view.raymarch.previewPacked && !lastPreviewPacked) {
          void runPreviewPacked();
        } else if (!s.view.raymarch.previewPacked && lastPreviewPacked) {
          disposePreview();
        }
      }
      lastPreviewPacked = s.view.raymarch.previewPacked;
    });

    // ── Orbit input → view slice camera (a gizmo handle hit short-circuits it) ──
    let dragging = false;
    let panning = false;
    let lastX = 0;
    let lastY = 0;
    // Closure-local, like dragging/panning above — not store fields (spec §5's "State
    // flow"). gizmoDragging's anchor is captured once at pointer-down; hoverHandle is
    // recomputed every non-dragging move, purely for drawBoxPreview's glyph highlight.
    let gizmoDragging: GizmoDragState | null = null;
    let hoverHandle: GizmoHandleId | null = null;

    /**
     * F1.7: the box wireframe (and therefore the gizmo, which draws with it)
     * is visible for any of three independent reasons — the persistent
     * toggle, the 200ms post-edit flash, or a drag in progress — and the
     * gizmo hit-test/hover-pick below must agree with the draw call in
     * frame() exactly, or picking an invisible handle would hijack an orbit
     * click while the toggle is off.
     */
    function boxWireframeVisible(s: AppState, now: number): boolean {
      return s.grid.showGridBox || now < boxPreviewUntil || gizmoDragging !== null;
    }

    // Identity copy of box.rotation, not [0,0,0,1] inline — cameraBasis(box) now rotates by
    // R⁻¹ (F2.3) whenever box.rotation isn't identity, but this call site still needs the
    // *unrotated* basis per spec §5: handle geometry and drag math are world-space, never
    // voxel-space (F2.3 review MAJOR — a rotated box otherwise mis-picks every handle).
    const IDENTITY_ROTATION: Vec4 = [0, 0, 0, 1];

    /** World-space pick ray through the pointer, against the *unrotated* CameraBasis —
     *  screenToRay's own contract: the gizmo picks world-space handle geometry, never
     *  voxel space. */
    function rayFromPointer(e: PointerEvent, s: AppState): Ray {
      const rect = canvas.getBoundingClientRect();
      const ndc: [number, number] = [
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -(((e.clientY - rect.top) / rect.height) * 2 - 1),
      ];
      const cam = cameraViewFor(s, [canvas.width, canvas.height]);
      const basis = cameraBasis(cam.eyeMpc, cam.targetMpc, cam.upMpc, {
        ...deriveGridBox(s.grid),
        rotation: IDENTITY_ROTATION,
      });
      const aspect = cam.viewportPx[0] / cam.viewportPx[1];
      return screenToRay(cam.eyeMpc, basis, cam.fovYRad, aspect, ndc);
    }

    /** Translate-arrow length for `box`, from the SAME camera formula boxPreviewPass draws
     *  against — pick and draw must agree or grabbing an arrow will miss where it's drawn. */
    function arrowLengthMpcFor(s: AppState, boxCenterMpc: Vec3): number {
      const cam = cameraViewFor(s, [canvas.width, canvas.height]);
      return gizmoArrowLengthMpc(cam.eyeMpc, boxCenterMpc, cam.fovYRad);
    }

    const onPointerDown = (e: PointerEvent): void => {
      const s = store.getSnapshot();
      if (boxWireframeVisible(s, performance.now())) {
        const pendingBox = deriveGridBox(s.grid);
        const ray = rayFromPointer(e, s);
        const arrowLengthMpc = arrowLengthMpcFor(s, pendingBox.centerMpc);
        const axes = axesFor(pendingBox.rotation);
        const hit = pickGizmoHandle(ray, gizmoHandleGeometry(pendingBox, axes, arrowLengthMpc));
        if (hit && hit.kind === 'rotate') {
          const axisDir = axes[hit.axis];
          const referenceDir = ringReferenceDirFor(axisDir);
          const anchorAngleRad = dragRotate(ray, pendingBox.centerMpc, axisDir, referenceDir);
          // null only on a ray parallel to the ring's own plane — an edge-on view a real click
          // on the visible ring can't produce in practice; falls through to orbit rather than
          // starting an undefined-angle drag.
          if (anchorAngleRad !== null) {
            gizmoDragging = { handle: hit, anchorAngleRad, anchorRotation: pendingBox.rotation };
            canvas.setPointerCapture(e.pointerId);
            return;
          }
        } else if (hit) {
          const anchorAxisParam = closestPointOnRayToLine(
            ray,
            pendingBox.centerMpc,
            axes[hit.axis],
          );
          gizmoDragging = { handle: hit, anchorAxisParam, anchorBox: pendingBox };
          canvas.setPointerCapture(e.pointerId);
          return;
        }
      }

      dragging = true;
      panning = e.button === 2 || e.button === 1;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerUp = (): void => {
      dragging = false;
      panning = false;
      gizmoDragging = null;
    };
    const onPointerMove = (e: PointerEvent): void => {
      const s = store.getSnapshot();

      if (gizmoDragging) {
        if (isAxisDrag(gizmoDragging)) {
          const drag = gizmoDragging;
          const axisDir = axesFor(drag.anchorBox.rotation)[drag.handle.axis];
          const ray = rayFromPointer(e, s);
          const param = closestPointOnRayToLine(ray, drag.anchorBox.centerMpc, axisDir);
          const deltaMpc = param - drag.anchorAxisParam;
          if (drag.handle.kind === 'translate') {
            const centerMpc = applyTranslateDrag(drag.anchorBox, axisDir, deltaMpc);
            store.setState((st) => ({ ...st, grid: setManualCenterMpc(st.grid, centerMpc) }));
          } else {
            const { centerMpc, sizeMpc } = applyResizeDrag(
              drag.anchorBox,
              drag.handle.axis,
              axisDir,
              drag.handle.sign,
              deltaMpc,
            );
            store.setState((st) => ({
              ...st,
              grid: setManualSizeMpc(setManualCenterMpc(st.grid, centerMpc), sizeMpc),
            }));
          }
        } else {
          // Fixed-anchor recompute (spec §5): every pointermove recomputes rotation' from the
          // SAME anchorRotation captured at pointerdown — no incremental accumulation onto the
          // previous frame's rotation, no renormalize. axisDir is invariant under its own
          // rotation (rotating about an axis never moves that axis), so deriving it from
          // anchorRotation rather than the live (already-changing) box rotation is exact, not
          // an approximation. centerMpc alone is read live: unlike translate/resize, a rotate
          // drag never writes it, so there is no re-derive feedback loop to guard against
          // (drag.anchorBox's whole reason to exist for THAT pair).
          const drag = gizmoDragging;
          const axisDir = axesFor(drag.anchorRotation)[drag.handle.axis];
          const referenceDir = ringReferenceDirFor(axisDir);
          const centerMpc = deriveGridBox(s.grid).centerMpc;
          const ray = rayFromPointer(e, s);
          const angleNow = dragRotate(ray, centerMpc, axisDir, referenceDir);
          if (angleNow !== null) {
            const rotation = multiplyQuat(
              quatFromAxisAngle(axisDir, angleNow - drag.anchorAngleRad),
              drag.anchorRotation,
            );
            store.setState((st) => ({ ...st, grid: setRotation(st.grid, rotation) }));
          }
        }
        return;
      }

      if (!dragging) {
        if (boxWireframeVisible(s, performance.now())) {
          const box = deriveGridBox(s.grid);
          const ray = rayFromPointer(e, s);
          const arrowLengthMpc = arrowLengthMpcFor(s, box.centerMpc);
          hoverHandle = pickGizmoHandle(
            ray,
            gizmoHandleGeometry(box, axesFor(box.rotation), arrowLengthMpc),
          );
        } else {
          hoverHandle = null;
        }
        return;
      }

      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (panning) {
        // Right/middle-drag pans the orbit target along the camera's right/up axes,
        // grab-the-world signs and screen-constant dist*0.0016 px rate — both
        // galaxy-renderer's createOrbitCameraInput, so the two tools share one hand feel.
        store.setState((s) => {
          const { yaw, pitch, distance, targetMpc } = s.view.camera;
          const cosY = Math.cos(yaw);
          const sinY = Math.sin(yaw);
          const cosP = Math.cos(pitch);
          const sinP = Math.sin(pitch);
          const k = distance * PAN_SPEED;
          const next: Vec3 = [
            targetMpc[0] + (-cosY * dx + -sinP * sinY * dy) * k,
            targetMpc[1] + cosP * dy * k,
            targetMpc[2] + (sinY * dx + -sinP * cosY * dy) * k,
          ];
          return { ...s, view: setCameraTarget(s.view, next) };
        });
        return;
      }
      store.setState((s) => ({
        ...s,
        view: setCameraYawPitch(
          s.view,
          s.view.camera.yaw - dx * DRAG_SPEED,
          s.view.camera.pitch + dy * DRAG_SPEED,
        ),
      }));
    };
    const onContextMenu = (e: Event): void => e.preventDefault();
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      store.setState((s) => ({
        ...s,
        view: setCameraDistance(s.view, s.view.camera.distance * Math.exp(e.deltaY * ZOOM_SPEED)),
      }));
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);

    return () => {
      disposed = true;
      clearTimeout(rebuildTimer);
      if (rafHandle) cancelAnimationFrame(rafHandle);
      unsubscribe();
      disposeHarness();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
    };
  }, [store]);

  return <canvas ref={canvasRef} style={canvasStyle} />;
}

export default Viewport;

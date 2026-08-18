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
import type { GridBox } from '../../@types/GridBox';
import type { McpmHarness } from '../../@types/McpmHarness';
import type { Store } from '../../@types/Store';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { resizeCanvasToDisplay } from '../../../../src/services/gpu/device';
import { hasUrlGate } from '../../../../src/utils/url/hasUrlGate';
import { downloadStem } from '../export/downloadStem';
import { emitTraceSidecar } from '../export/emitTraceSidecar';
import { exportNpy } from '../export/exportNpy';
import { triggerDownload } from '../export/triggerDownload';
import { autoFitGridBox } from '../field/autoFitGridBox';
import { catalogBounds } from '../field/catalogBounds';
import { deriveAgentWeights } from '../field/deriveAgentWeights';
import { loadCatalogPoints } from '../field/loadCatalogPoints';
import { syntheticCatalog } from '../field/syntheticCatalog';
import { createRenderGraph, type RenderGraph } from '../render/RenderGraph';
import type { TraceView } from '../render/tracePass';
import type { McpmCameraView } from '../render/writeMcpmCamera';
import { createMcpmHarness } from '../sim/createMcpmHarness';
import { planGridBudget } from '../sim/planGridBudget';
import { setCatalogLoadStatus, setCatalogLoaded } from '../state/slices/catalogSlice';
import { setResolvedGrid } from '../state/slices/gridSlice';
import { incrementStep, resetStepCount } from '../state/slices/simSlice';
import {
  setCameraDistance,
  setCameraTargetOffset,
  setCameraYawPitch,
  setFps,
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

/** Everything but catalog identity — a change here reuses already-loaded points. */
function buildKey(s: AppState): unknown[] {
  return [
    s.catalog.weightMode,
    s.grid.autoFit,
    s.grid.longAxisTarget,
    s.grid.paddingMpc,
    s.grid.manualCenterMpc,
    s.grid.manualSizeMpc,
    s.grid.manualResolution,
    s.sim.agentCount,
    s.sim.initMode,
    s.sim.seed,
  ];
}

/**
 * `packedSourceName` stands in for the dropped catalog's identity — cheap to
 * JSON.stringify every store notification (incl. every running-sim frame),
 * where the override's own Float32Arrays would not be.
 */
function catalogKey(s: AppState): unknown[] {
  return [s.catalog.sources, s.catalog.tier, s.catalog.packedSourceName];
}

/** The six fields that reshape the grid box — a change here restarts the preview timer. */
function gridShapeKeyFor(s: AppState): unknown[] {
  return [
    s.grid.autoFit,
    s.grid.manualCenterMpc,
    s.grid.manualSizeMpc,
    s.grid.manualResolution,
    s.grid.longAxisTarget,
    s.grid.paddingMpc,
  ];
}

function manualBounds(center: Vec3, size: Vec3): { min: Vec3; max: Vec3 } {
  const half: Vec3 = [size[0] / 2, size[1] / 2, size[2] / 2];
  return {
    min: [center[0] - half[0], center[1] - half[1], center[2] - half[2]],
    max: [center[0] + half[0], center[1] + half[1], center[2] + half[2]],
  };
}

function gridBoxFor(s: AppState, points: CatalogPoints): GridBox {
  const { grid } = s;
  const bounds = grid.autoFit
    ? catalogBounds(points.positions)
    : manualBounds(grid.manualCenterMpc, grid.manualSizeMpc);
  const longAxisTarget = grid.autoFit ? grid.longAxisTarget : grid.manualResolution;
  const paddingMpc = grid.autoFit ? grid.paddingMpc : 0;
  return autoFitGridBox(bounds, longAxisTarget, paddingMpc);
}

/** The one camera every view resolves from: an overlay off by a frame's basis is a lie. */
function cameraViewFor(
  s: AppState,
  box: GridBox,
  viewportPx: readonly [number, number],
): McpmCameraView {
  const { yaw, pitch, distance, targetOffsetMpc } = s.view.camera;
  const targetMpc: Vec3 = [
    box.centerMpc[0] + targetOffsetMpc[0],
    box.centerMpc[1] + targetOffsetMpc[1],
    box.centerMpc[2] + targetOffsetMpc[2],
  ];
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
    let lastGridShapeKey = JSON.stringify(gridShapeKeyFor(store.getSnapshot()));
    let boxPreviewUntil = 0;
    // -1 sentinel: skips the first frame's delta, which spans the async catalog
    // load + harness build and would otherwise seed the EMA with a huge bogus dt.
    let lastFrameTime = -1;
    let fpsEma = 0;
    let lastFpsPushTime = 0;
    let lastPushedFps = 0;

    function disposeHarness(): void {
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
          h.step(s.sim.params);
          store.setState((st) => ({ ...st, sim: incrementStep(st.sim) }));
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
        const cam = cameraViewFor(s, h.box, [canvas.width, canvas.height]);
        // Independent layers over one clear, back to front. The clear is unconditional:
        // with every layer off the frame is black, not last frame's pixels.
        const { layers } = s.view;
        graph.clear(encoder);
        if (layers.raymarch) graph.drawTrace(encoder, traceViewFor(s, h.box, cam));
        if (layers.agents) {
          graph.drawSplat(encoder, { ...cam, sampleWeight: s.view.raymarch.sampleWeight });
        }
        if (layers.galaxies) graph.drawGalaxyOverlay(encoder, cam, s.view.galaxies);
        // The pending box leads the debounced harness rebuild by up to REBUILD_DEBOUNCE_MS —
        // that lead is the point, live tuning ahead of the rebuild landing. Drawn last, over
        // the galaxy dots.
        if (points && now < boxPreviewUntil) {
          graph.drawBoxPreview(encoder, cam, h.box, gridBoxFor(s, points));
        }
        graph.tonemap(encoder, h.gpu.context.getCurrentTexture().createView(), EXPOSURE, CONTRAST);
        h.gpu.device.queue.submit([encoder.finish()]);
      };
      rafHandle = requestAnimationFrame(frame);
    }

    async function buildFromPoints(pts: CatalogPoints, generation: number): Promise<void> {
      const s = store.getSnapshot();
      const weights = deriveAgentWeights(pts.log10StellarMass, s.catalog.weightMode);
      store.setState((st) => ({
        ...st,
        catalog: setCatalogLoaded(st.catalog, pts.count, weights.nanCount),
      }));

      const box = gridBoxFor(s, pts);
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

      const budget = planGridBudget(
        box,
        pts.count + s.sim.agentCount,
        h.element,
        h.gpu.device.limits,
      );
      store.setState((st) => ({
        ...st,
        grid: setResolvedGrid(st.grid, box, h.element, budget),
        sim: resetStepCount(st.sim),
      }));

      const makeShader = (code: string, label: string): GPUShaderModule =>
        h.gpu.device.createShaderModule({ code, label });
      const graph = createRenderGraph(h.gpu.device, h.gpu.format, makeShader);
      // The trace buffer dies with its harness, so the pass is re-attached on every
      // rebuild — a graph kept across one would march freed memory.
      graph.attachTrace({
        traceBuffer: h.traceBuffer,
        box,
        element: h.element,
        paletteId: s.view.raymarch.paletteId,
      });
      graph.attachAgents(h.agents, box);
      renderGraph = graph;
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
          store.setState((st) => ({ ...st, sim: resetStepCount(st.sim) }));
        }
        if (s.sim.clearTraceToken !== lastClearToken) {
          lastClearToken = s.sim.clearTraceToken;
          harness.clearTrace();
        }
        if (s.sim.exportToken !== lastExportToken) {
          lastExportToken = s.sim.exportToken;
          void runExport();
        }
      }
    });

    // ── Orbit input → view slice camera ────────────────────────────────────
    let dragging = false;
    let panning = false;
    let lastX = 0;
    let lastY = 0;
    const onPointerDown = (e: PointerEvent): void => {
      dragging = true;
      panning = e.button === 2 || e.button === 1;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerUp = (): void => {
      dragging = false;
      panning = false;
    };
    const onPointerMove = (e: PointerEvent): void => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (panning) {
        // Right/middle-drag pans the orbit target along the camera's right/up axes,
        // grab-the-world signs and screen-constant dist*0.0016 px rate — both
        // galaxy-renderer's createOrbitCameraInput, so the two tools share one hand feel.
        store.setState((s) => {
          const { yaw, pitch, distance, targetOffsetMpc } = s.view.camera;
          const cosY = Math.cos(yaw);
          const sinY = Math.sin(yaw);
          const cosP = Math.cos(pitch);
          const sinP = Math.sin(pitch);
          const k = distance * PAN_SPEED;
          const next: Vec3 = [
            targetOffsetMpc[0] + (-cosY * dx + -sinP * sinY * dy) * k,
            targetOffsetMpc[1] + cosP * dy * k,
            targetOffsetMpc[2] + (sinY * dx + -sinP * cosY * dy) * k,
          ];
          return { ...s, view: setCameraTargetOffset(s.view, next) };
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

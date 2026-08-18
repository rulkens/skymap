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
import type { AppState } from '../../@types/AppState';
import type { CatalogPoints } from '../../@types/CatalogPoints';
import type { GridBox } from '../../@types/GridBox';
import type { McpmHarness } from '../../@types/McpmHarness';
import type { Store } from '../../@types/Store';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { resizeCanvasToDisplay } from '../../../../src/services/gpu/device';
import { autoFitGridBox } from '../field/autoFitGridBox';
import { catalogBounds } from '../field/catalogBounds';
import { deriveAgentWeights } from '../field/deriveAgentWeights';
import { loadCatalogPoints } from '../field/loadCatalogPoints';
import { createRenderGraph, type RenderGraph } from '../render/RenderGraph';
import type { TraceView } from '../render/tracePass';
import { createMcpmHarness } from '../sim/createMcpmHarness';
import { planGridBudget } from '../sim/planGridBudget';
import { setCatalogLoadStatus, setCatalogLoaded } from '../state/slices/catalogSlice';
import { setResolvedGrid } from '../state/slices/gridSlice';
import { incrementStep, resetStepCount } from '../state/slices/simSlice';
import { setCameraDistance, setCameraYawPitch } from '../state/slices/viewSlice';

const EXPOSURE = 1;
const CONTRAST = 1;
const REBUILD_DEBOUNCE_MS = 400;
const DRAG_SPEED = 0.005;
const ZOOM_STEP = 0.025;
const FOV_Y_RAD = Math.PI / 4;
const CAMERA_UP: Vec3 = [0, 1, 0];
// Polyphorm's marching knobs, at the fork's neutral settings until the view slice
// grows controls for them: no low-end cutoff, unit weight, and one sample per slab
// (stepVoxels = 1.0 is fork parity — see mcpm/fragment.wesl).
const TRIM_DENSITY = 0;
const SAMPLE_WEIGHT = 1;
const STEP_VOXELS = 1;

const canvasStyle: CSSProperties = { display: 'block', width: '100vw', height: '100vh' };

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

function catalogKey(s: AppState): unknown[] {
  return [s.catalog.sources, s.catalog.tier];
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

function traceViewFor(s: AppState, box: GridBox, aspect: number): TraceView {
  const { yaw, pitch, distance } = s.view.camera;
  const cosPitch = Math.cos(pitch);
  const eyeMpc: Vec3 = [
    box.centerMpc[0] + distance * cosPitch * Math.sin(yaw),
    box.centerMpc[1] + distance * Math.sin(pitch),
    box.centerMpc[2] + distance * cosPitch * Math.cos(yaw),
  ];
  return {
    eyeMpc,
    targetMpc: box.centerMpc,
    upMpc: CAMERA_UP,
    fovYRad: FOV_Y_RAD,
    aspect,
    trimDensity: TRIM_DENSITY,
    sampleWeight: SAMPLE_WEIGHT,
    opticalThickness: s.view.raymarch.opticalThickness,
    stepVoxels: STEP_VOXELS,
    // Scaled to the grid, never fixed: the box diagonal is longer than any axis, and a
    // bound short of it truncates the march silently, with no visual cue that it did.
    maxSteps: 2 * Math.max(box.dims[0], box.dims[1], box.dims[2]),
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

    function disposeHarness(): void {
      renderGraph?.dispose();
      renderGraph = null;
      harness?.dispose();
      harness = null;
    }

    function startLoop(): void {
      if (rafHandle) cancelAnimationFrame(rafHandle);
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

        resizeCanvasToDisplay(canvas);
        graph.resize(canvas.width, canvas.height);

        const encoder = h.gpu.device.createCommandEncoder({ label: 'mcpm-workbench-frame' });
        // The raymarch clears the accum target itself: it is the frame's base layer, so
        // any additive layer added later must be encoded after this call, not before.
        graph.drawTrace(encoder, traceViewFor(s, h.box, canvas.width / canvas.height));
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
      lastResetToken = store.getSnapshot().sim.resetToken;
      lastClearToken = store.getSnapshot().sim.clearTraceToken;

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
      renderGraph = graph;
      startLoop();
    }

    /** One build against the live snapshot, reloading the catalog only if its key moved. */
    async function buildOnce(generation: number): Promise<void> {
      const s = store.getSnapshot();
      const ck = JSON.stringify(catalogKey(s));
      try {
        if (!points || ck !== loadedCatalogKey) {
          store.setState((st) => ({ ...st, catalog: setCatalogLoadStatus(st.catalog, 'loading') }));
          const pts = await loadCatalogPoints(s.catalog.sources, s.catalog.tier);
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
      }
    });

    // ── Orbit input → view slice camera ────────────────────────────────────
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onPointerDown = (e: PointerEvent): void => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerUp = (): void => {
      dragging = false;
    };
    const onPointerMove = (e: PointerEvent): void => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      store.setState((s) => ({
        ...s,
        view: setCameraYawPitch(
          s.view,
          s.view.camera.yaw + dx * DRAG_SPEED,
          s.view.camera.pitch + dy * DRAG_SPEED,
        ),
      }));
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      store.setState((s) => ({
        ...s,
        view: setCameraDistance(
          s.view,
          s.view.camera.distance * (1 + Math.sign(e.deltaY) * ZOOM_STEP),
        ),
      }));
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });

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
    };
  }, [store]);

  return <canvas ref={canvasRef} style={canvasStyle} />;
}

export default Viewport;

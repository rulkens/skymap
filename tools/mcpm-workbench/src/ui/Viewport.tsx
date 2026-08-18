/**
 * Viewport — owns the <canvas>, the McpmHarness, the render graph, and the
 * RAF loop; bridges pointer/wheel input into the view slice's orbit camera.
 *
 * Device ownership (adjudicated): `createMcpmHarness` is the ONLY caller of
 * `initGpu` — it requests the shader-f16 feature and the compute limits the
 * kernels need. Calling `initGpu` here too would race a second device onto
 * the same canvas and hand the render graph a device without those limits.
 * `harness.gpu` is the one device both sim and render use.
 *
 * A harness REBUILD (catalog reload, grid box, agent count, init mode,
 * weight mode, seed) disposes the old harness fully before `createMcpmHarness`
 * runs again — sequential, never concurrent, so there is still only ever one
 * live device per canvas. Structural changes are debounced (400ms) so typing
 * into a grid-box field doesn't reallocate GPU buffers per keystroke;
 * McpmParams sliders, run controls (pause/resume/reset/clear), and camera
 * input are NOT debounced — the harness reads params live each step, and
 * reset/clear-trace are one-shot commands processed the instant their token
 * changes.
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
import { createMcpmHarness } from '../sim/createMcpmHarness';
import { planGridBudget } from '../sim/planGridBudget';
import { setCatalogLoadStatus, setCatalogLoaded } from '../state/slices/catalogSlice';
import { setResolvedGrid } from '../state/slices/gridSlice';
import { incrementStep, resetStepCount } from '../state/slices/simSlice';
import { setCameraDistance, setCameraYawPitch } from '../state/slices/viewSlice';

const CLEAR_COLOR: readonly [number, number, number] = [0.08, 0.03, 0.16];
const EXPOSURE = 1;
const CONTRAST = 1;
const REBUILD_DEBOUNCE_MS = 400;
const DRAG_SPEED = 0.005;
const ZOOM_STEP = 0.025;

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
    let rebuilding = false;
    let harness: McpmHarness | null = null;
    let renderGraph: RenderGraph | null = null;
    let points: CatalogPoints | null = null;
    let lastCatalogKey = JSON.stringify(catalogKey(store.getSnapshot()));
    let lastBuildKey = '';
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
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: graph.accumView(),
              loadOp: 'clear',
              clearValue: { r: CLEAR_COLOR[0], g: CLEAR_COLOR[1], b: CLEAR_COLOR[2], a: 1 },
              storeOp: 'store',
            },
          ],
        });
        pass.end();
        graph.tonemap(encoder, h.gpu.context.getCurrentTexture().createView(), EXPOSURE, CONTRAST);
        h.gpu.device.queue.submit([encoder.finish()]);
      };
      rafHandle = requestAnimationFrame(frame);
    }

    async function buildFromPoints(pts: CatalogPoints): Promise<void> {
      if (disposed) return;
      const s = store.getSnapshot();
      lastBuildKey = JSON.stringify(buildKey(s));

      const weights = deriveAgentWeights(pts.log10StellarMass, s.catalog.weightMode);
      store.setState((st) => ({ ...st, catalog: setCatalogLoaded(st.catalog, pts.count, weights.nanCount) }));

      const box = gridBoxFor(s, pts);
      disposeHarness();
      if (disposed) return;

      try {
        const h = await createMcpmHarness({
          canvas,
          points: pts,
          weights,
          box,
          agentCount: s.sim.agentCount,
          initMode: s.sim.initMode,
          seed: s.sim.seed,
        });
        if (disposed) {
          h.dispose();
          return;
        }
        harness = h;
        lastResetToken = store.getSnapshot().sim.resetToken;
        lastClearToken = store.getSnapshot().sim.clearTraceToken;

        const budget = planGridBudget(box, pts.count + s.sim.agentCount, h.element, h.gpu.device.limits);
        store.setState((st) => ({
          ...st,
          grid: setResolvedGrid(st.grid, box, h.element, budget),
          sim: resetStepCount(st.sim),
        }));

        const makeShader = (code: string, label: string): GPUShaderModule =>
          h.gpu.device.createShaderModule({ code, label });
        renderGraph = createRenderGraph(h.gpu.device, h.gpu.format, makeShader);
        startLoop();
      } catch (err) {
        console.error('mcpm-workbench: harness build failed', err);
        if (!disposed) {
          store.setState((st) => ({ ...st, catalog: setCatalogLoadStatus(st.catalog, 'error') }));
        }
      }
    }

    async function loadAndBuild(): Promise<void> {
      const s = store.getSnapshot();
      lastCatalogKey = JSON.stringify(catalogKey(s));
      store.setState((st) => ({ ...st, catalog: setCatalogLoadStatus(st.catalog, 'loading') }));
      try {
        const pts = await loadCatalogPoints(s.catalog.sources, s.catalog.tier);
        if (disposed) return;
        points = pts;
        await buildFromPoints(pts);
      } catch (err) {
        console.error('mcpm-workbench: catalog load failed', err);
        if (!disposed) {
          store.setState((st) => ({ ...st, catalog: setCatalogLoadStatus(st.catalog, 'error') }));
        }
      }
    }

    loadAndBuild().catch((err: unknown) => {
      console.error('mcpm-workbench: boot failed', err);
    });

    const unsubscribe = store.subscribe(() => {
      if (disposed) return;
      const s = store.getSnapshot();

      const ck = JSON.stringify(catalogKey(s));
      if (ck !== lastCatalogKey) {
        lastCatalogKey = ck;
        clearTimeout(rebuildTimer);
        loadAndBuild().catch((err: unknown) => {
          console.error('mcpm-workbench: reload failed', err);
        });
        return;
      }

      const bk = JSON.stringify(buildKey(s));
      if (bk !== lastBuildKey && points) {
        lastBuildKey = bk;
        clearTimeout(rebuildTimer);
        rebuildTimer = window.setTimeout(() => {
          if (points && !rebuilding) {
            rebuilding = true;
            buildFromPoints(points).finally(() => {
              rebuilding = false;
            });
          }
        }, REBUILD_DEBOUNCE_MS);
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
        view: setCameraDistance(s.view, s.view.camera.distance * (1 + Math.sign(e.deltaY) * ZOOM_STEP)),
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

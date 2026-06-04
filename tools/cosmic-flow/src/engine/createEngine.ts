/**
 * createEngine — wires the WebGPU device, field, render graph, camera, and the
 * registered visualizations into one per-frame loop (the Engine Facade).
 *
 * ### The render loop (one command encoder per frame)
 *
 *   1. Read a store snapshot (the engine reads directly via `getSnapshot`, NOT
 *      through a React subscription — so writing back to the store can't loop).
 *   2. Drive the orbit camera from `camera` slice + an internal auto-rotate
 *      accumulator; compute `viewProj`; write it BACK to the store so the React
 *      LabelsOverlay projects structure labels in lockstep with the frame.
 *   3. For each ENABLED visualization with an `encodeCompute`, record its
 *      compute pass.
 *   4. Open the shared HDR accumulation pass; each enabled visualization draws
 *      additively. Draw order is fixed (density behind flow) regardless of
 *      registration order — see `DRAW_ORDER`.
 *   5. Tonemap the HDR target to the swap-chain, using the active flow mode's
 *      exposure/contrast.
 *
 * ### Camera / store bridge
 *
 * The engine OWNS the OrbitCamera but treats the store as the source of truth
 * for yaw/pitch/distance/autoRotate: it copies those in each frame rather than
 * sharing the mutable camera object with the React controls. The controls
 * (Viewport, a later phase) push yaw/pitch/distance INTO the store; the engine
 * never exposes its camera across the boundary. Auto-rotation is an internal
 * accumulator added to the store's yaw, matching the spike's `autoYaw`.
 *
 * Reuse (spec §8): `initGpu`/`resizeCanvasToDisplay` (device), the orbit-camera
 * trio (`createOrbitCamera`/`updatePosition`/`computeViewProj`), and the shared
 * shader-compile logger via `makeShaderFactory`.
 */
import type { Engine } from '../../@types/engine/Engine';
import type { EngineContext } from '../../@types/engine/EngineContext';
import type { FrameContext } from '../../@types/engine/FrameContext';
import type { Visualization } from '../../@types/visualizations/Visualization';
import type { Store } from '../../@types/state/Store';
import type { AppState } from '../../@types/state/AppState';
import type { Mat4 } from '../../../../src/@types/math/Mat4';
import { initGpu, resizeCanvasToDisplay } from '../../../../src/services/gpu/device';
import {
  createOrbitCamera,
  updatePosition,
  computeViewProj,
} from '../../../../src/services/camera/orbitCamera';
import { makeShaderFactory } from './gpu/makeShaderFactory';
import { createRenderGraph } from './RenderGraph';
import { createVelocityField } from '../field/createVelocityField';
import { listFactories } from '../visualizations/registry';
import {
  selectActiveFlowParams,
  selectEnabledLayers,
  selectFrameParams,
} from '../state/selectors';
import { setCameraViewProj } from '../state/slices/cameraSlice';

// Field asset URLs — served from the tool's vite `publicDir` at the web root.
const BIN_URL = '/cf4pp_vfield.bin';
const JSON_URL = '/cf4pp_vfield.json';

// Camera projection (spike parity): fov 1.0 rad, near 0.05, far 50.
const FOV_Y_RAD = 1.0;
const NEAR = 0.05;
const FAR = 50;
const AUTO_ROTATE_RATE = 0.08; // radians/sec added to yaw while auto-rotating (spike)
const MAX_DT = 0.05; // clamp so a backgrounded-then-resumed tab can't take a giant step

// Layers draw back-to-front in this fixed order so the density volume sits
// BEHIND the flow trails regardless of which registered first.
const DRAW_ORDER = ['densityVolume', 'flowField'];

export async function createEngine(
  canvas: HTMLCanvasElement,
  store: Store<AppState>,
): Promise<Engine> {
  const { device, context, format } = await initGpu(canvas);
  const shaderFactory = makeShaderFactory(device);
  const renderGraph = createRenderGraph(device, format, shaderFactory);
  const field = await createVelocityField(device, BIN_URL, JSON_URL);

  const ctx: EngineContext = {
    device,
    hdrFormat: renderGraph.hdrFormat,
    field,
    createShaderModule: shaderFactory,
  };

  // Instantiate every registered visualization once and initialise it.
  const layers: readonly { readonly id: string; readonly viz: Visualization }[] = listFactories().map(
    ({ id, factory }) => ({ id, viz: factory() }),
  );
  await Promise.all(layers.map((l) => l.viz.init(ctx)));

  const drawOrdered = [...layers].sort(
    (a, b) => drawRank(a.id) - drawRank(b.id),
  );

  const initial = store.getSnapshot();
  const cam = createOrbitCamera({
    target: [0, 0, 0],
    distance: initial.camera.distance,
    yaw: initial.camera.yaw,
    pitch: initial.camera.pitch,
    fovYRad: FOV_Y_RAD,
    aspect: canvas.width / canvas.height || 1,
    near: NEAR,
    far: FAR,
  });

  let running = false;
  let rafHandle = 0;
  let frame = 0;
  let lastT = 0;
  let autoYaw = 0;

  function tick(now: number): void {
    if (!running) return;
    rafHandle = requestAnimationFrame(tick);
    if (document.hidden) {
      lastT = now; // keep the clock current so the resume frame has a small dt
      return;
    }
    const dt = lastT === 0 ? 0 : Math.min(MAX_DT, (now - lastT) / 1000);
    lastT = now;

    const s = store.getSnapshot();

    resizeCanvasToDisplay(canvas);
    renderGraph.resize(canvas.width, canvas.height);

    if (s.camera.autoRotate) autoYaw += dt * AUTO_ROTATE_RATE;
    cam.yaw = s.camera.yaw + autoYaw;
    cam.pitch = s.camera.pitch;
    cam.distance = s.camera.distance;
    cam.aspect = canvas.width / canvas.height || 1;
    updatePosition(cam);
    const viewProj = Array.from(computeViewProj(cam)) as Mat4;

    // Publish viewProj so the React label overlay projects in sync with the frame.
    store.setState((prev) => ({ ...prev, camera: setCameraViewProj(prev.camera, viewProj) }));

    const enabled = selectEnabledLayers(s);
    const fc: FrameContext = {
      viewProj,
      dt,
      frame,
      size: [canvas.width, canvas.height],
      enabled,
      params: selectFrameParams(s),
    };

    const encoder = device.createCommandEncoder();
    for (const l of layers) {
      if (enabled.has(l.id)) l.viz.encodeCompute?.(encoder, fc);
    }
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: renderGraph.accumView(),
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          storeOp: 'store',
        },
      ],
    });
    for (const l of drawOrdered) {
      if (enabled.has(l.id)) l.viz.encode(pass, fc);
    }
    pass.end();

    const active = selectActiveFlowParams(s);
    renderGraph.tonemap(
      encoder,
      context.getCurrentTexture().createView(),
      active.exposure,
      active.contrast,
    );
    device.queue.submit([encoder.finish()]);
    frame++;
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      lastT = 0;
      rafHandle = requestAnimationFrame(tick);
    },
    stop(): void {
      running = false;
      if (rafHandle) cancelAnimationFrame(rafHandle);
    },
    dispose(): void {
      running = false;
      if (rafHandle) cancelAnimationFrame(rafHandle);
      for (const l of layers) l.viz.dispose();
      renderGraph.dispose();
      field.dispose();
    },
  };
}

/** Lower rank draws first (further back). Unknown ids draw last. */
function drawRank(id: string): number {
  const i = DRAW_ORDER.indexOf(id);
  return i === -1 ? DRAW_ORDER.length : i;
}

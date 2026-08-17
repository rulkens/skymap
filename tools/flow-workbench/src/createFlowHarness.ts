/**
 * createFlowHarness — the workbench's thin host around the CANONICAL flow
 * renderer.
 *
 * Phase E's whole point: there is ONE flow implementation. Before this, the
 * workbench ran its own copy of the flow renderer behind a `Visualization`
 * registry. Now it composes — the host owns only what a flow-tuning harness
 * needs (device, HDR graph, orbit camera, the per-frame loop, the store bridge)
 * and DELEGATES every flow concern to `createFlowFieldRenderer` from `src/`. The
 * renderer's `upload`/`encodeCompute`/`draw`/`maybeReseed` are exactly the
 * surface the runtime engine drives, so the look the workbench shows IS the look
 * the app ships. We do not reimplement; we drive.
 *
 * ### The render loop (one command encoder per frame), mirroring the engine
 *
 *   1. Drive the orbit camera from the `camera` slice + an internal auto-rotate
 *      accumulator; compute `viewProj`.
 *   2. Detect a reseed need (mode or rounded count changed) and arm it. The
 *      workbench keeps the renderer out of React the same way the runtime does:
 *      store-driven, never a React effect poking the GPU.
 *   3. Encode the flow compute pass (seed-when-armed + integrate) via the shared
 *      `encodeFlowCompute` gate.
 *   4. Open the HDR accumulation pass; the renderer draws its additive ribbons.
 *   5. Tonemap the HDR target to the swap-chain.
 *   6. Publish `viewProj` back to the store so the React LabelsOverlay projects
 *      structure labels in lockstep with the frame.
 *
 * ### Tonemap caveat (EXPOSURE / CONTRAST)
 *
 * The canonical `FlowSettings` carries NO exposure/contrast — in the runtime,
 * `intensity` is the brightness knob and the app's own HDR tonemap (Reinhard
 * etc.) resolves the buffer. The workbench keeps its spike-era fixed blit
 * tonemap, so we feed it constant EXPOSURE/CONTRAST (the spike's advect look).
 * That makes the absolute brightness here APPROXIMATE relative to the main app;
 * `intensity` is still the right per-look control. Matching the app's exact
 * tonemap would mean importing its curve set — out of scope for a tuning
 * harness, where relative look (mode/trail/speed/density/fade) is what matters.
 */
import type { Store } from '../@types/state/Store';
import type { AppState } from '../@types/state/AppState';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { Mat4 } from '../../../src/@types/math/Mat4';
import type { Vec2 } from '../../../src/@types/math/Vec2';
import { initGpu, resizeCanvasToDisplay } from '../../../src/services/gpu/device';
import { createOrbitCamera } from '../../../src/utils/camera/createOrbitCamera';
import { updatePosition } from '../../../src/utils/camera/updatePosition';
import { computeViewProj } from '../../../src/utils/camera/computeViewProj';
import { createFlowFieldRenderer } from '../../../src/services/gpu/renderers/flowField/flowFieldRenderer';
import { encodeFlowCompute } from '../../../src/services/engine/frame/encodeFlowCompute';
import {
  decodeScalarField,
  SCALAR_FIELD_DATA_PREFIX,
} from '../../../src/data/volume/scalarFieldFormat';
import { loadDataManifest } from '../../../src/services/loading/dataManifest';
import { dataUrl } from '../../../src/services/loading/fetchWithProgress';
import { makeShaderFactory } from './engine/gpu/makeShaderFactory';
import { createRenderGraph } from './engine/RenderGraph';
import { setCameraViewProj } from './state/slices/cameraSlice';

export type FlowHarness = {
  start(): void;
  stop(): void;
  dispose(): void;
};

// Camera projection. Distances are Mpc (the canonical renderer places the cube
// at physical extent — a ±500 Mpc box), so near/far bracket that scale with
// room to orbit from inside the field out to a wide shot.
const FOV_Y_RAD = 1.0;
const NEAR = 5;
const FAR = 6000;
const AUTO_ROTATE_RATE = 0.08; // radians/sec added to yaw while auto-rotating (spike)
const MAX_DT = 0.05; // clamp so a backgrounded-then-resumed tab can't take a giant step

// Fixed HDR-blit tonemap (the spike's advect look). See the module header — the
// canonical FlowSettings has no exposure/contrast, so the workbench pins them.
const EXPOSURE = 0.3;
const CONTRAST = 2.3;

export async function createFlowHarness(
  canvas: HTMLCanvasElement,
  store: Store<AppState>,
): Promise<FlowHarness> {
  const { device, context, format } = await initGpu(canvas);
  const renderGraph = createRenderGraph(device, format, makeShaderFactory(device));
  const renderer = createFlowFieldRenderer({ device, targetFormat: renderGraph.hdrFormat });

  // Fetch → decode → hand the cube to the renderer (which uploads it to a 3D
  // texture internally and arms the first reseed). We pass the decoded
  // ScalarCube, not an uploaded FlowField — upload owns the GPU upload.
  // The workbench's publicDir points at the repo's public/, so this resolves
  // through the same manifest the runtime boot sequence fetches.
  let loaded = false;
  await loadDataManifest();
  const buf = await (
    await fetch(dataUrl(`${SCALAR_FIELD_DATA_PREFIX}/flowfield.scfd`))
  ).arrayBuffer();
  renderer.upload(decodeScalarField(buf));
  loaded = true;

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
  let lastT = 0;
  let autoYaw = 0;

  // Reseed trackers: a mode switch OR a change in the rounded particle count
  // must re-seed the shared buffer set (Delta 1 in flowFieldRenderer — the modes
  // share one buffer triple, so switching must overwrite stale state). We watch
  // those two store fields and arm a reseed when either moves, mirroring the
  // runtime handle's reseed-on-mode/count.
  let lastMode = initial.flow.mode;
  let lastCount = Math.round(initial.flow.count);

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

    // Camera: copy the pose from the store + the internal auto-rotate yaw.
    if (s.camera.autoRotate) autoYaw += dt * AUTO_ROTATE_RATE;
    cam.yaw = s.camera.yaw + autoYaw;
    cam.pitch = s.camera.pitch;
    cam.distance = s.camera.distance;
    cam.aspect = canvas.width / canvas.height || 1;
    updatePosition(cam);
    const viewProj = computeViewProj(cam);

    resizeCanvasToDisplay(canvas);
    renderGraph.resize(canvas.width, canvas.height);

    // Store-driven reseed: arm when mode or rounded count changed since last frame.
    const roundedCount = Math.round(s.flow.count);
    if (s.flow.mode !== lastMode || roundedCount !== lastCount) {
      renderer.maybeReseed();
      lastMode = s.flow.mode;
      lastCount = roundedCount;
    }

    const encoder = device.createCommandEncoder();

    // Compute pass (seed-when-armed + integrate). The gate skips entirely when
    // the layer is off or the cube hasn't loaded. `encodeFlowCompute` reads its
    // gates off an `EngineState`; the workbench has no engine, so it assembles
    // just the slice the gate consumes — the renderer handle, the flow settings,
    // and a ready-when-loaded asset slot (the shape `slotReady` inspects).
    encodeFlowCompute(
      encoder,
      {
        gpu: { flowFieldRenderer: renderer },
        settings: { flow: s.flow },
        assetSlots: { flow: loaded ? { state: () => ({ kind: 'ready' }) } : null },
      } as unknown as EngineState,
      now,
    );

    // HDR accumulation pass — the renderer draws its additive ribbons into it.
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
    if (s.flow.enabled && loaded) {
      const viewportPx: Vec2 = [canvas.width, canvas.height];
      renderer.draw(pass, viewProj, viewportPx, s.flow, 1);
    }
    pass.end();

    renderGraph.tonemap(encoder, context.getCurrentTexture().createView(), EXPOSURE, CONTRAST);
    device.queue.submit([encoder.finish()]);

    // Publish viewProj so the React label overlay projects in sync with the frame.
    const viewProjTuple = Array.from(viewProj) as Mat4;
    store.setState((prev) => ({ ...prev, camera: setCameraViewProj(prev.camera, viewProjTuple) }));
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
      renderer.destroy();
      renderGraph.dispose();
    },
  };
}

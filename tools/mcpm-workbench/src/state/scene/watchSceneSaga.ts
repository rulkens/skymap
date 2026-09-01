/**
 * watchSceneSaga — the debounced build/rebuild/empty-scene/device-loss
 * pipeline that used to live in Viewport.tsx's closures (buildOnce/
 * buildFromPoints/buildEmptyScene/acquireGpu). `resources` (saga context)
 * replaces those closure locals — Viewport's frame driver now reads the
 * SAME object by reference. `takeLatest` wrapping `delay` reproduces the
 * old clearTimeout/setTimeout debounce; cancellation + `resources.epoch`
 * (bumped by every `disposeScene`, even a no-op one) replace `buildGeneration`/
 * `disposed`. `catalogLoaded` rides this SAME debounce — unlike the old
 * two-speed split (catalog: immediate, rest: debounced) — since a catalog
 * load already dwarfs `REBUILD_DEBOUNCE_MS`.
 */
import {
  takeLatest,
  delay,
  call,
  put,
  select,
  spawn,
  getContext,
  cancelled,
} from 'typed-redux-saga';

import type { GpuContext } from '../../../../../src/@types/rendering/GpuContext';
import { initGpu } from '../../../../../src/services/gpu/device';
import { hasUrlGate } from '../../../../../src/utils/url/hasUrlGate';
import { deriveAgentWeights } from '../../field/deriveAgentWeights';
import { deriveGridBox } from '../../field/deriveGridBox';
import { disposeScene, type RenderResources } from '../../render/renderResources';
import { createMcpmHarness } from '../../sim/createMcpmHarness';
import { planGridBudget } from '../../sim/planGridBudget';
import type { WorkbenchSagaContext } from '../../store/sagaContext';
import type { RootState } from '../../store/types';
import {
  catalogLoaded,
  setCatalogBuildError,
  setCatalogStatusMessage,
  setWeightMode,
} from '../slices/catalogSlice';
import {
  fitBoxToCatalog,
  installImportedBox,
  setManualCenterMpc,
  setManualSizeMpc,
  setMaxBufferBytes,
  setPaddingMpc,
  setResolvedGrid,
  setRotation,
  setVoxelSizeMpc,
} from '../slices/gridSlice';
import { resetHistogram } from '../slices/histogramSlice';
import { setAgentCount, setInitMode, setSeed, resetStepCount } from '../slices/simSlice';
import { deviceLost } from '../slices/viewSlice';
import { REBUILD_DEBOUNCE_MS } from './REBUILD_DEBOUNCE_MS';

// Same shape as Viewport's old acquireGpu — the propagate kernel's compute
// limits, requested here since this is now the one call site.
const GPU_REQUEST_OPTIONS = {
  requiredFeatures: ['shader-f16'] as const,
  requiredLimits: {
    maxComputeInvocationsPerWorkgroup: 1024, // propagate's 10x10x10 = 1000
    maxBufferSize: Number.MAX_SAFE_INTEGER, // clamped to the adapter's max by initGpu
    maxStorageBufferBindingSize: Number.MAX_SAFE_INTEGER,
  },
};

/**
 * Every action that can move a field the old value-diffing `buildKey` (now
 * deleted) serialized — hand-enumerated since a saga reacts to actions, not
 * state diffs. `setSeed` is NOT in the brief's own list but IS in `buildKey`'s
 * old field set (`s.sim.seed`) — included here to match current behaviour;
 * dropping it would silently stop a seed change from rebuilding the harness.
 * `gridShapeOf.ts` is the field-level source of truth this list has to stay
 * in sync with by hand: a new GridSlice field there needs its setter added
 * here too. `resetRequested` is deliberately excluded — Task 7's `harness.
 * reset` reseeds in place, matching current behaviour.
 */
const SCENE_REBUILD_TRIGGERS = [
  catalogLoaded,
  setWeightMode,
  setVoxelSizeMpc,
  setPaddingMpc,
  setManualCenterMpc,
  setManualSizeMpc,
  setRotation,
  installImportedBox,
  fitBoxToCatalog,
  setAgentCount,
  setInitMode,
  setSeed,
];

/**
 * Watches the device this specific build acquired. Detached (`spawn`, not
 * `fork`): a `fork`ed child is cancelled along with its parent, but this must
 * outlive the worker that started it — the device it watches often keeps
 * rendering for many rebuilds after this call returns. The `resources.gpu`
 * staleness check is the same guard Viewport's old `currentDevice` variable
 * gave: a device abandoned by a later rebuild (never explicitly destroyed,
 * same as before) can still independently be lost, and that must not clobber
 * the CURRENT device's status.
 */
function* watchDeviceLoss(resources: RenderResources, gpu: GpuContext) {
  const info = yield* call(() => gpu.device.lost);
  if (resources.gpu?.device !== gpu.device || info.reason === 'destroyed') return;
  yield* put(setCatalogStatusMessage(`GPU device lost (${info.reason}) — reload the page`));
  yield* put(deviceLost());
}

/** `?probe`-gated boot signal (probeGpuErrors.ts) — was Viewport's own `buildFromPoints`
 * write; moved here since Viewport no longer builds a harness. Set ONLY on a completed
 * full build, never the empty-catalog one — the probe waits for a real harness. */
type ProbeReadyWindow = { __mcpmProbeReady?: boolean };

function* buildScene() {
  const canvas = yield* getContext<WorkbenchSagaContext['canvas']>('canvas');
  const resources = yield* getContext<WorkbenchSagaContext['resources']>('resources');
  if (!canvas || !resources) return; // context not registered yet — see sagaContextRegistered

  try {
    disposeScene(resources);
    const gpu = yield* call(initGpu, canvas, GPU_REQUEST_OPTIONS);
    resources.gpu = gpu;
    yield* spawn(watchDeviceLoss, resources, gpu);

    const s = yield* select((state: RootState) => state);
    const { points } = s.catalog;
    if (!points) return; // pre-boot gap before the first catalogLoaded

    // Dynamic import: RenderGraph.ts pulls in this tool's OWN `./shaders/blit.wesl`,
    // which lives outside the shared shader tree — a static import here would drag a
    // GPU-only, WESL-linked module into every module graph that reaches this saga
    // (e.g. tests that only want a store, never render a frame).
    const { createRenderGraph } = yield* call(() => import('../../render/RenderGraph'));

    if (points.count === 0) {
      resources.graph = createRenderGraph(gpu.device, gpu.format, (code, label) =>
        gpu.device.createShaderModule({ code, label }),
      );
      yield* put(
        setCatalogStatusMessage(
          'no catalog points — enable a source or pick a tier that carries one',
        ),
      );
      return;
    }

    const weights = deriveAgentWeights(points.log10StellarMass, s.catalog.weightMode);
    const box = deriveGridBox(s.grid);
    const harness = yield* call(createMcpmHarness, {
      gpu,
      points,
      weights,
      box,
      agentCount: s.sim.agentCount,
      initMode: s.sim.initMode,
      seed: s.sim.seed,
    });
    resources.harness = harness;
    resources.weights = weights;

    // h.agents.nDataPoints, not points.count: createMcpmHarness culls out-of-box
    // catalog points, so the harness's own buffers are already smaller whenever
    // the box crops the catalog.
    const budget = planGridBudget(
      box,
      harness.agents.nDataPoints + s.sim.agentCount,
      harness.element,
      harness.gpu.device.limits,
    );
    yield* put(setResolvedGrid({ box, resolvedElement: harness.element, byteBudget: budget }));
    yield* put(setMaxBufferBytes(harness.gpu.device.limits.maxStorageBufferBindingSize));
    yield* put(resetStepCount());
    yield* put(resetHistogram());

    const makeShader = (code: string, label: string): GPUShaderModule =>
      harness.gpu.device.createShaderModule({ code, label });
    const graph = createRenderGraph(harness.gpu.device, harness.gpu.format, makeShader);
    const traceSource = {
      traceBuffer: harness.traceBuffer,
      box,
      element: harness.element,
      paletteId: s.view.raymarch.paletteId,
    };
    graph.attachTrace(traceSource);
    graph.attachVolpath({ ...traceSource, paletteId: s.view.pathTracer.paletteId });
    graph.attachAgents(harness.agents, harness.overlayAgents, box);
    resources.graph = graph;
    if (hasUrlGate('probe')) (window as unknown as ProbeReadyWindow).__mcpmProbeReady = true;
  } catch (err) {
    yield* put(setCatalogBuildError((err as Error).message));
  } finally {
    // A newer trigger can cancel this generator (takeLatest's `iterator.
    // return()`) at any yield point above, after harness/graph were already
    // stashed into `resources` — dispose exactly what this half-finished
    // attempt left behind rather than leaking it. Never runs on a clean
    // finish: `cancelled()` is false there, leaving the finished scene alone.
    if (yield* cancelled()) disposeScene(resources);
  }
}

export function* watchSceneSaga() {
  yield* takeLatest(SCENE_REBUILD_TRIGGERS, function* () {
    yield* delay(REBUILD_DEBOUNCE_MS);
    yield* call(buildScene);
  });
}

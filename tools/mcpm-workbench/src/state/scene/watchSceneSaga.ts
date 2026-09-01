/**
 * watchSceneSaga — builds/rebuilds/disposes the MCPM scene (device, harness,
 * render graph) into `resources` (saga context), which Viewport's frame
 * driver reads by reference. `takeLatest` debounces every structural
 * trigger by `REBUILD_DEBOUNCE_MS`: a new trigger cancels whatever the
 * previous one was doing (still waiting, or mid-build) and restarts the
 * wait. Cancellation unwinds the generator synchronously and redux-saga
 * drops the eventual `createMcpmHarness()` result rather than resuming
 * the generator with it — `acceptBuiltHarness` (called from inside that
 * promise's own `.then()`, not after the `yield*`) is what disposes an
 * orphaned build instead of leaking it; see its own doc comment.
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
  setResolvedGrid,
  setRotation,
  setVoxelSizeMpc,
} from '../slices/gridSlice';
import { resetHistogram } from '../slices/histogramSlice';
import { setAgentCount, setInitMode, setSeed, resetStepCount } from '../slices/simSlice';
import { deviceLost } from '../slices/viewSlice';
import { acceptBuiltHarness } from './acceptBuiltHarness';
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
 * Every action that moves a field `deriveGridBox`/`createMcpmHarness` actually
 * read — hand-enumerated since a saga reacts to actions, not state diffs.
 * `gridShapeOf.ts` (`manualCenterMpc`/`manualSizeMpc`/`manualRotation`/
 * `manualVoxelSizeMpc`) plus `grid.importedBox` is the field-level source of
 * truth this list has to stay in sync with by hand — `watchSceneSaga.test.ts`'s
 * exhaustive fixture is what catches a drift. `setPaddingMpc` is deliberately
 * EXCLUDED: `paddingMpc` itself is outside `gridShapeOf` (baked into
 * `manualSizeMpc` only at the next `fitBoxToCatalog` click), and clearing
 * `importedBox` is a no-op from any state that already has it null — the one
 * narrow miss (padding edited while a preset IS loaded) is accepted, not
 * covered by the other setters riding this list. `setSeed` IS included (it's
 * outside the brief's own worked example, but `createMcpmHarness` seeds agents
 * from it at construction). `resetRequested` is excluded — Task 7's
 * `harness.reset` reseeds in place, not a rebuild.
 */
export const SCENE_REBUILD_TRIGGERS = [
  catalogLoaded,
  setWeightMode,
  setVoxelSizeMpc,
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

  // Declared OUTSIDE the try so `finally` (a separate block scope) can set it —
  // read live from inside `acceptBuiltHarness`'s promise continuation, which is
  // the only code that still runs if `takeLatest` cancels this generator.
  const cancellation = { aborted: false };
  try {
    disposeScene(resources);
    // The epoch this build owns: a NEWER build's own `disposeScene` (its first line,
    // same as this one) bumps `resources.epoch` again — the second, independent
    // guard `acceptBuiltHarness` uses for a dispose that happens WITHOUT saga
    // cancellation at all (Viewport's unmount calls `disposeScene` directly).
    const myEpoch = resources.epoch;
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
    // The staleness check runs INSIDE this promise's own `.then()` (acceptBuiltHarness),
    // not after the `yield*` below — see the module header for why code placed after
    // the yield can never run for a build cancelled while this was in flight.
    const harness = yield* call(() =>
      createMcpmHarness({
        gpu,
        points,
        weights,
        box,
        agentCount: s.sim.agentCount,
        initMode: s.sim.initMode,
        seed: s.sim.seed,
      }).then((built) => acceptBuiltHarness(built, resources, myEpoch, cancellation)),
    );
    if (!harness) return; // stale — superseded while awaiting; already disposed
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
    console.error('mcpm-workbench: build failed', err);
    yield* put(setCatalogBuildError((err as Error).message));
  } finally {
    // Runs SYNCHRONOUSLY at cancellation (before any pending promise can settle),
    // which is what makes `cancellation.aborted` a reliable flag for
    // `acceptBuiltHarness` to read later. Also disposes whatever this attempt had
    // ALREADY stashed into `resources` before being cancelled — `resources.gpu`,
    // or `resources.graph` on the empty-scene path, or the gap between
    // `resources.harness` being assigned and the final `resources.graph = graph`.
    // Does NOT cover the harness while `createMcpmHarness`'s promise is still in
    // flight — that harness isn't reachable from `resources` yet, which is
    // exactly why `acceptBuiltHarness` has to dispose it from inside the promise
    // instead. Never runs on a clean finish: `cancelled()` is false there,
    // leaving the finished scene alone.
    if (yield* cancelled()) {
      cancellation.aborted = true;
      disposeScene(resources);
    }
  }
}

export function* watchSceneSaga() {
  yield* takeLatest(SCENE_REBUILD_TRIGGERS, function* () {
    yield* delay(REBUILD_DEBOUNCE_MS);
    yield* call(buildScene);
  });
}

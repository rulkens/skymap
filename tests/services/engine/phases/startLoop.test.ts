/**
 * startLoop — the invariants of the last bootstrap phase.
 *
 * `bootstrap.test.ts` mocks the phase at module scope, so the code that builds `RunFrameDeps`,
 * replaces the forward-declared `frameRef.current` and fires the first `requestRender()` needs
 * direct asserts: a regression there (forgotten `requestRender()`, swapped `frameRef.current` order,
 * skipped cloud-count early return) is a black canvas on first paint with the engine stuck in
 * 'loading'. `runFrame` is mocked (tested in `runFrame.test.ts`); only the wiring matters here.
 */

import { describe, it, expect, vi } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';

const runFrameSpy = vi.fn();
vi.mock('../../../../src/services/engine/frame/runFrame', () => ({
  runFrame: (...args: unknown[]) => runFrameSpy(...args),
}));

import { startLoop } from '../../../../src/services/engine/phases/startLoop';
import { CONTENT_PASSES } from '../../../../src/services/engine/frame/passes';
import { PRELUDE, SCENE } from '../../../../src/data/rendering/frameSections';
import { composeRenderTargetRows } from '../../../../src/services/engine/layer/composeRenderTargetRows';
import { APP_COMPOSITION } from '../../../../src/compositions/app';
import { STUB_COMPOSITION } from '../../../helpers/engine/stubComposition';
import { stubPlannersFor } from '../../../helpers/frame/stubPlannersFor';

// A `plan` line's planner is never optional, so PRELUDE's and SCENE's Layer-owned rows need a stand-in here.
const LAYER_PLANNER_STUBS = [...stubPlannersFor(PRELUDE), ...stubPlannersFor(SCENE)];

/** Minimal `EngineState` with what the phase reads: `sources.catalogs` (early-return guard; only
 *  `.size` matters, set by `cloudCount`), `subsystems.scheduler.requestRender`, and the REAL
 *  `gpu.renderTargets.specs` so `checkFrameOrder` runs for real (covered by `frameOrderBoot.test.ts`). */
function makeState({ cloudCount = 1 } = {}): EngineState {
  const catalogs = new Map<unknown, unknown>();
  for (let i = 0; i < cloudCount; i++) {
    catalogs.set(i, {});
  }
  return {
    sources: { catalogs },
    gpu: {
      renderTargets: {
        specs: composeRenderTargetRows(
          'bgra8unorm',
          APP_COMPOSITION.layers.map((layer) => layer.targets ?? []),
        ),
      },
    },
    subsystems: {
      scheduler: { requestRender: vi.fn() },
    },
    cam: {} as never,
    viewRig: 'mono',
    // `checkFrameOrder` runs against the COMPOSED rows; over an empty layer
    // tuple that is core's own registry.
    passes: CONTENT_PASSES,
    computes: [],
    planners: LAYER_PLANNER_STUBS,
  } as unknown as EngineState;
}

function makeDeps(): BootstrapDeps {
  return {
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
    cb: { store: { dispatch: vi.fn(), getState: () => ({}) } } as never,
    composition: STUB_COMPOSITION,
    frameRef: { current: () => {} },
    handleRef: { current: null },
    allSlots: new Map(),
    selection: {
      resolvePick: () => null,
      extractRow: () => null,
      resolveFocusId: () => null,
      focusIdOf: () => null,
    },
    phaseLocals: {
      device: {} as GPUDevice,
      context: {} as GPUCanvasContext,
      format: 'bgra8unorm' as GPUTextureFormat,
      unwatchHdrCapability: () => {},
    },
  };
}

describe('startLoop', () => {
  it('replaces frameRef.current and fires scheduler.requestRender exactly once on the happy path', async () => {
    // Load-bearing invariant: the forward-declared `frameRef.current`
    // no-op stub MUST be replaced before the rAF kick.  The scheduler
    // was wired with `onFrame: () => frameRef.current()`, so if the
    // replacement is dropped, every subsequent tick runs the no-op
    // forever — black canvas indefinitely.
    const state = makeState({ cloudCount: 1 });
    const deps = makeDeps();
    const originalFrameBody = deps.frameRef.current;

    await startLoop(state, deps);

    expect(deps.frameRef.current).not.toBe(originalFrameBody);
    expect(state.subsystems.scheduler.requestRender).toHaveBeenCalledTimes(1);
  });

  it('the new frameRef.current invokes runFrame with (state, frameDeps, time)', async () => {
    const state = makeState({ cloudCount: 1 });
    const deps = makeDeps();

    await startLoop(state, deps);
    runFrameSpy.mockClear();

    deps.frameRef.current();

    expect(runFrameSpy).toHaveBeenCalledTimes(1);
    const callArgs = runFrameSpy.mock.calls[0]!;
    expect(callArgs[0]).toBe(state);
    // frameDeps is built inside startLoop and must carry the canvas threaded from deps. Renderer handles
    // are not part of `RunFrameDeps`: every `ContentPass.draw` reads its renderer off `state.gpu.*`.
    const calledFrameDeps = callArgs[1] as Record<string, unknown>;
    expect(calledFrameDeps.canvas).toBe(deps.canvas);
    expect(typeof callArgs[2]).toBe('number'); // performance.now() snapshot
  });

  it('starts the loop unconditionally even with no catalogs loaded', async () => {
    // Progressive disclosure: the loop must start so the Milky Way is
    // visible on first frame; galaxy catalogs fade in as they arrive.
    const state = makeState({ cloudCount: 0 });
    const deps = makeDeps();
    const originalFrameBody = deps.frameRef.current;

    await startLoop(state, deps);

    expect(state.subsystems.scheduler.requestRender).toHaveBeenCalledTimes(1);
    expect(deps.frameRef.current).not.toBe(originalFrameBody);
  });

  it('throws a clear error when initGpu never ran', async () => {
    // `phaseLocals` is written only by `initGpu`; its absence is the only
    // reachable way this phase sees it undefined, so a missing value means
    // `initGpu` was skipped or reordered ahead of `startLoop`.
    const state = makeState({ cloudCount: 1 });
    const deps = makeDeps();
    delete (deps as { phaseLocals?: unknown }).phaseLocals;

    await expect(startLoop(state, deps)).rejects.toThrow(/initGpu must run before startLoop/);
  });
});

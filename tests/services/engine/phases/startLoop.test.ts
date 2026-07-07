// tests/services/engine/phases/startLoop.test.ts
/**
 * startLoop — focused test for the highest-leverage invariants of the
 * fourth (and last) bootstrap phase.
 *
 * ### Why this file exists
 *
 * Pre-2026-05-11 audit #5 the only coverage `startLoop.ts` had was
 * `bootstrap.test.ts`, which mocks the phase at module scope — so the
 * ~150 lines that build `RunFrameDeps`, replace the forward-declared
 * `frameRef.current`, and fire the first `requestRender()` had zero
 * direct asserts.  Every boot runs this phase; a silent regression
 * here (e.g. forgetting `requestRender()`, swapping `frameRef.current`
 * order with the dep-bag build, skipping the cloud-count early return)
 * yields "black canvas on first paint, engine stuck in 'loading'" —
 * the same symptom class as the 2026-05-08 black-screen incident.
 *
 * ### What this file asserts
 *
 * Four invariants — see each test's docblock for the rationale:
 *   1. The happy path: `frameRef.current` is replaced AND
 *      `scheduler.requestRender()` is called.
 *   2. The new `frameRef.current` calls `runFrame(state, frameDeps,
 *      performance.now())` — pinning the call contract guards against
 *      a refactor that drops one of the three args.
 *   3. The cloud-count early return: zero clouds → no rAF kick.
 *   4. The renderer-readiness guard: null renderer → typed error.
 *
 * ### Why mock `runFrame`
 *
 * The real `runFrame` is the engine's per-frame body — it reads every
 * GPU renderer, runs the camera matrices, dispatches passes, and is
 * tested in its own `runFrame.test.ts`.  Here we only care that
 * `startLoop` *wires it up correctly*; mocking lets the new
 * `frameRef.current` be invoked at test time without dragging in
 * WebGPU.
 */

import { describe, it, expect, vi } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';

// ── Module mocks ──────────────────────────────────────────────────────

// `runFrame` is the engine's per-frame body — independently tested
// elsewhere.  Mock it so we can verify `startLoop` calls it with the
// right shape without invoking the real GPU pass dispatch.
const runFrameSpy = vi.fn();
vi.mock('../../../../src/services/engine/frame/runFrame', () => ({
  runFrame: (...args: unknown[]) => runFrameSpy(...args),
}));

// Imported AFTER the mocks so startLoop picks them up.
import { startLoop } from '../../../../src/services/engine/phases/startLoop';

// ── Fixtures ─────────────────────────────────────────────────────────

/**
 * Minimal `EngineState` shaped for startLoop's body.  Populates only
 * what the phase reads:
 *   - `state.sources.clouds.size` for the early-return guard;
 *   - `state.gpu.{milkyWay,thumbnail,disk,filament}Renderer` for the
 *     dep-bag build + the null-check guard;
 *   - `state.subsystems.scheduler.requestRender` for the rAF kick.
 *
 * `cloudCount` controls how many entries `clouds` carries; the values
 * don't matter (only `.size` is read in this phase).
 */
function makeState({ cloudCount = 1 } = {}): EngineState {
  const catalogs = new Map<unknown, unknown>();
  for (let i = 0; i < cloudCount; i++) {
    catalogs.set(i, {});
  }
  return {
    sources: { catalogs },
    gpu: {
      milkyWayCloudRenderer: { label: 'milkyWayCloud' } as never,
      horizonShellRenderer: { label: 'horizonShell' } as never,
      texturedDiskRenderer: { label: 'disk' } as never,
      proceduralDiskRenderer: { label: 'proc' } as never,
      filamentRenderer: { label: 'filament' } as never,
    },
    subsystems: {
      scheduler: { requestRender: vi.fn() },
    },
    cam: {} as never,
  } as unknown as EngineState;
}

/**
 * Minimal `BootstrapDeps` shaped for startLoop's body.  Populates only
 * the fields the phase reads.  `frameRef.current` starts as a no-op
 * stub so we can assert it gets replaced.
 */
function makeDeps(): BootstrapDeps {
  return {
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
    cb: {} as never,
    frameRef: { current: () => {} },
    detachControlsRef: { current: null },
    handleRef: { current: null },
    allSlots: new Map(),
    phaseLocals: {
      device: {} as GPUDevice,
      context: {} as GPUCanvasContext,
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────

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
    // Pinning the call contract guards against a refactor that drops
    // or reorders the three args.  runFrame's own suite verifies the
    // body; here we only verify the wire.
    const state = makeState({ cloudCount: 1 });
    const deps = makeDeps();

    await startLoop(state, deps);
    runFrameSpy.mockClear();

    deps.frameRef.current();

    expect(runFrameSpy).toHaveBeenCalledTimes(1);
    const callArgs = runFrameSpy.mock.calls[0]!;
    expect(callArgs[0]).toBe(state);
    // frameDeps is built inside startLoop — verify it carries the
    // expected renderer + canvas references threaded from state/deps.
    const calledFrameDeps = callArgs[1] as Record<string, unknown>;
    expect(calledFrameDeps.canvas).toBe(deps.canvas);
    expect(calledFrameDeps.milkyWayCloudRenderer).toBe(state.gpu.milkyWayCloudRenderer);
    expect(calledFrameDeps.texturedDiskRenderer).toBe(state.gpu.texturedDiskRenderer);
    expect(calledFrameDeps.filamentRenderer).toBe(state.gpu.filamentRenderer);
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

  it('throws a clear error when a required GPU renderer is null', async () => {
    // Pre-M1 these reads silently `!`-banged, deferring crashes to
    // the first frame.  Post-M1 the phase fails loudly at the
    // construction site so reordering bugs surface here, not five
    // frames later in some renderer's draw() call.
    const state = makeState({ cloudCount: 1 });
    state.gpu.milkyWayCloudRenderer = null as never;
    const deps = makeDeps();

    await expect(startLoop(state, deps)).rejects.toThrow(
      /milkyWayCloud\/horizonShell\/texturedDisk\/proceduralDisk renderers must be initialised/,
    );
  });
});

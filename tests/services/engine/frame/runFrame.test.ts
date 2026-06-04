/**
 * runFrame — focused integration test for the FPS-counter wiring.
 *
 * The full per-frame body is exercised end-to-end by higher-level engine
 * tests (renderFrame.test.ts integration suite, engine.tier-swap-race, etc.).
 * This file only verifies the *plumbing* the Phase-3 extraction introduces:
 * the `lastReportedFps` mutable closure now lives behind a `{current}` ref
 * threaded through `RunFrameDeps`, and the round-trip — sample the counter,
 * compare against the ref, fire the callback when the integer rolls over —
 * still happens inside `runFrame`.
 *
 * Testing only this slice keeps the test cheap: we don't need a GPU device,
 * an OrbitCamera, or any of the rendering subsystems.  The frame body is
 * structured so every "do something" path is gated on a state field
 * (`state.cam`, `state.gpu.renderer`, …) — leaving them all null short-
 * circuits the body before any of the GPU work runs, while still letting
 * the FPS sampling at the very top of the body execute.  See the early-
 * return at `if (!vp || !rendererRef || …) return` inside runFrame for
 * the bail-out that makes this possible.
 */

import { describe, it, expect, vi } from 'vitest';

// Demand re-evaluation is the engine's per-frame heartbeat: runFrame calls it
// every tick so any state change (a setter flipping a flag, then waking the
// loop via requestRender) re-derives what should load.  Mock it here so the
// FPS-wiring fixtures don't drive the real demand table, and so the dedicated
// test below can assert the per-frame call without a full registry.
vi.mock('../../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));

import { runFrame } from '../../../../src/services/engine/frame/runFrame';
import { reevaluateDemand } from '../../../../src/services/engine/wiring/reevaluateDemand';
import { createDisabledGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';
import type { RunFrameDeps } from '../../../../src/@types/engine/frame/RunFrameDeps';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

/**
 * Build a minimal `EngineState`-shaped fixture that lets `runFrame`
 * execute the FPS-sampling block at the top of the body and then bail
 * out cleanly via the renderer-null guard further down.  Casting through
 * `unknown` keeps the test honest — if the FPS path ever reaches into a
 * field not stubbed here, the test will surface it as a runtime
 * undefined rather than a silently-passing stub.
 */
function makeState(): EngineState {
  return {
    // Post-H5 nested-only settings shape.
    settings: {
      points: {
        sizePx: 2,
        brightness: 0.5,
        depthFade: false,
        highlightFallback: false,
        realOnly: false,
      },
      tonemap: { exposure: 1, curve: 'linear' },
      camera: { autoRotate: false },
      bias: { mode: 'off', absMagLimit: -19 },
      thumbnails: { enabled: false },
      milkyWay: { enabled: false },
      filaments: { enabled: false, intensity: 1 },
      volumes: { masterEnabled: false },
    },
    bias: {
      apparentMagLimit: 0,
      schechterMStar: 0,
      schechterAlpha: 0,
    },
    sources: {
      pickMask: 0,
      drawMask: 0,
      catalogs: new Map(),
      famousMeta: [],
      tier: 'medium',
    },
    picking: {
      latestMouseCss: null,
      lastPickedMouseCss: null,
      pickInFlight: false,
      pointerDown: false,
    },
    gpu: {
      renderer: null,
      pickRenderer: null,
      postProcess: null,
      filamentRenderer: null,
    },
    subsystems: {
      tweens: { advance: vi.fn(), isActive: () => false },
      spaceMouse: { applyToCamera: vi.fn(), hasAxes: () => false },
      scheduler: { requestRender: vi.fn() },
      // Minimal selection-subsystem stub.  The runFrame body reads
      // `focused()` (cluster-focus fade) + `selected()` (halo) for the
      // renderFrame settings bag; the renderer-null guard short-circuits
      // before those reads fire in this fixture, but we provide the stub
      // so the EngineState type is satisfied.
      selection: {
        hovered: () => null,
        selected: () => null,
        focused: () => null,
        setHovered: vi.fn(),
        setSelected: vi.fn(),
        setFocused: vi.fn(),
        destroy: vi.fn(),
      },
      galaxyAtlas: null,
      proceduralDisks: null,
      texturedDisks: null,
      clickResolver: null,
      inputBindings: null,
      loadProgress: null,
    },
    cam: null,
    initialCamSnapshot: null,
    assetSlots: {
      points: new Map(),
      filaments: null,
      famousMeta: null,
      pgcAlias: null,
    },
  } as unknown as EngineState;
}

/**
 * Build a `RunFrameDeps` whose only meaningful field is the FPS wiring;
 * every other dep is a no-op stub because the renderer-null bail-out
 * inside `runFrame` short-circuits before any of them are touched.
 */
function makeDeps(opts: {
  fpsValue: number | null;
  lastReportedFps: { current: number | null };
  onFpsChange?: (fps: number) => void;
}): RunFrameDeps {
  return {
    canvas: {
      width: 0,
      height: 0,
      clientWidth: 0,
      clientHeight: 0,
    } as unknown as HTMLCanvasElement,
    // H5 task 11: runFrame fires the nested `lifecycle.onFpsChange`
    // address only.  The test fixture mirrors that shape.
    cb: { lifecycle: { onFpsChange: opts.onFpsChange } } as unknown as RunFrameDeps['cb'],
    fpsCounter: {
      sample: vi.fn().mockReturnValue(opts.fpsValue),
    } as unknown as RunFrameDeps['fpsCounter'],
    lastReportedFps: opts.lastReportedFps,
    device: {} as unknown as GPUDevice,
    context: {} as unknown as GPUCanvasContext,
    milkyWayRenderer: {} as unknown as RunFrameDeps['milkyWayRenderer'],
    horizonShellRenderer: {} as unknown as RunFrameDeps['horizonShellRenderer'],
    filamentRenderer: {} as unknown as RunFrameDeps['filamentRenderer'],
    texturedDiskRenderer: {} as unknown as RunFrameDeps['texturedDiskRenderer'],
    proceduralDiskRenderer: {} as unknown as RunFrameDeps['proceduralDiskRenderer'],
    milkyWayITimeEpochMs: 0,
    // Disabled stub matches production's "no `?gpuTimings`" path.
    timingService: createDisabledGpuTimingService(),
  };
}

describe('runFrame — FPS wiring', () => {
  it('updates lastReportedFps.current and fires onFpsChange when the counter rolls over to a new integer', () => {
    const onFpsChange = vi.fn();
    const lastReportedFps = { current: null as number | null };

    const state = makeState();
    const deps = makeDeps({ fpsValue: 60, lastReportedFps, onFpsChange });

    runFrame(state, deps, 1000);

    expect(lastReportedFps.current).toBe(60);
    expect(onFpsChange).toHaveBeenCalledWith(60);
    expect(onFpsChange).toHaveBeenCalledOnce();
  });

  it('does not re-fire onFpsChange when the counter samples the same integer twice in a row', () => {
    const onFpsChange = vi.fn();
    const lastReportedFps = { current: 60 as number | null };

    const state = makeState();
    const deps = makeDeps({ fpsValue: 60, lastReportedFps, onFpsChange });

    runFrame(state, deps, 1016);

    // Same integer → no callback fire, ref unchanged.
    expect(onFpsChange).not.toHaveBeenCalled();
    expect(lastReportedFps.current).toBe(60);
  });

  it('does not fire onFpsChange when the counter is still bootstrapping (sample returns null)', () => {
    const onFpsChange = vi.fn();
    const lastReportedFps = { current: null as number | null };

    const state = makeState();
    const deps = makeDeps({ fpsValue: null, lastReportedFps, onFpsChange });

    runFrame(state, deps, 0);

    expect(onFpsChange).not.toHaveBeenCalled();
    expect(lastReportedFps.current).toBeNull();
  });
});

describe('runFrame — demand re-evaluation', () => {
  it('re-derives demand once per frame', () => {
    // The per-frame call is what lets every setter Just Work: a setter flips
    // its demand-gating state and calls requestRender (which it must, to
    // repaint), the loop wakes, and this re-derivation loads whatever became
    // demanded.  No setter has to remember to call reevaluateDemand itself —
    // forgetting requestRender would visibly freeze the UI, so the trigger
    // can't silently regress the way a forgotten per-setter call did.
    vi.mocked(reevaluateDemand).mockClear();
    const state = makeState();
    const deps = makeDeps({ fpsValue: null, lastReportedFps: { current: null } });

    runFrame(state, deps, 1000);

    expect(reevaluateDemand).toHaveBeenCalledOnce();
    expect(reevaluateDemand).toHaveBeenCalledWith(state);
  });
});

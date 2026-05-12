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

import { runFrame } from '../../../../src/services/engine/frame/runFrame';
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
      volumes: { masterEnabled: false, fields: {} },
    },
    bias: {
      apparentMagLimit: 0,
      schechterMStar: 0,
      schechterAlpha: 0,
    },
    sources: {
      visibleMask: 0,
      lodMode: 'manual',
      clouds: new Map(),
      famousMeta: [],
      famousXrefs: {},
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
      // `selected()` for the renderFrame settings bag; the renderer-null
      // guard short-circuits before that read fires in this fixture, but
      // we provide the stub so the EngineState type is satisfied.
      selection: {
        hovered: () => null,
        selected: () => null,
        setHovered: vi.fn(),
        setSelected: vi.fn(),
        pointInfoFor: () => null,
        destroy: vi.fn(),
      },
      thumbnails: null,
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
    fpsCounter: { sample: vi.fn().mockReturnValue(opts.fpsValue) } as unknown as RunFrameDeps['fpsCounter'],
    lastReportedFps: opts.lastReportedFps,
    device: {} as unknown as GPUDevice,
    context: {} as unknown as GPUCanvasContext,
    milkyWayRenderer: {} as unknown as RunFrameDeps['milkyWayRenderer'],
    filamentRenderer: {} as unknown as RunFrameDeps['filamentRenderer'],
    texturedQuadRenderer: {} as unknown as RunFrameDeps['texturedQuadRenderer'],
    texturedDiskRenderer: {} as unknown as RunFrameDeps['texturedDiskRenderer'],
    milkyWayITimeEpochMs: 0,
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

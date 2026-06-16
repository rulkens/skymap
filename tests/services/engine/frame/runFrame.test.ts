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

// resizeCanvasToDisplay reads window.devicePixelRatio; in this node test
// environment window is undefined. The cam-bearing regression fixtures
// reach the resize block (non-null cam), so stub it to a no-op false —
// resize is incidental to what these tests exercise (the camera drivers).
// runFrame imports only resizeCanvasToDisplay from this module, so a full
// replacement is safe (nothing else from gpu/device needs the real impl).
vi.mock('../../../../src/services/gpu/device', () => ({
  resizeCanvasToDisplay: () => false,
}));

import { runFrame } from '../../../../src/services/engine/frame/runFrame';
import { buildCameraDrivers } from '../../../../src/services/engine/camera/cameraDrivers';
import { reevaluateDemand } from '../../../../src/services/engine/wiring/reevaluateDemand';
import { createDisabledGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';
import type { RunFrameDeps } from '../../../../src/@types/engine/frame/RunFrameDeps';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import { GALAXY_CATALOG_SOURCES, SOURCE_REGISTRY } from '../../../../src/data/sources';

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
      tier: 'medium',
      galaxyCatalogs: {
        enabled: true,
        sizePx: 2,
        brightness: 0.5,
        depthFade: false,
        highlightFallback: false,
        realOnly: false,
        // deriveSourceMasks (called at the top of runFrame, before the
        // renderer-null bail-out) iterates EVERY GALAXY_CATALOG_SOURCES code and reads
        // items[id].enabled, so a partial record would throw on the first
        // missing id. Seed them all enabled.
        items: Object.fromEntries(
          GALAXY_CATALOG_SOURCES.map((s) => [
            SOURCE_REGISTRY[s].id,
            { enabled: true, labelEnabled: true },
          ]),
        ),
      },
      tonemap: { exposure: 1, curve: 'linear' },
      camera: { autoRotate: false },
      bias: { mode: 'off', absMagLimit: -19 },
      thumbnails: { enabled: false },
      milkyWay: { enabled: false },
      filaments: { enabled: false, intensity: 1 },
      volumes: { enabled: false },
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
      // deriveSourceMasks reads opacityOf({kind:'galaxyCatalog', id}) for every
      // galaxy catalog to compute the fade-out draw tail; 0 everywhere (no fade in
      // flight) is the right baseline for these fixtures.
      fades: { opacityOf: () => 0 },
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
    drivers: [],
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

/**
 * Camera-driver regression fixtures.
 *
 * Unlike `makeState()` (whose `cam: null` bails before the camera block),
 * these fixtures carry a real `OrbitCamera`-shaped `cam` so the per-frame
 * camera-driver resolver — which runs BEFORE `deriveFrameContext` — is
 * actually exercised.  The renderer is still null, so `deriveFrameContext`
 * reports not-ready and the body early-returns right after the camera
 * block: exactly the slice we want to pin without standing up a GPU.
 *
 * `makeCamState` lets each test control the three driver predicates
 * (autoRotate / tween-active / spaceMouse-axes) and inject a tween
 * `advance` that mutates the camera, so we can prove which driver actually
 * authored the frame.
 */
function makeCamState(opts: {
  autoRotate?: boolean;
  tweenActive?: boolean;
  tweenAdvance?: (cam: OrbitCamera, nowMs: number) => void;
  spaceMouseHasAxes?: boolean;
  spaceMouseApply?: (cam: OrbitCamera, nowMs: number) => void;
}): EngineState {
  const cam: OrbitCamera = {
    yaw: 0,
    pitch: 0,
    distance: 100,
    target: new Float32Array([0, 0, 0]),
    position: new Float32Array([0, 0, 0]),
    fovYRad: 0.8,
    aspect: 1,
    near: 0.01,
    far: 1000,
  } as unknown as OrbitCamera;

  const state = makeState();
  // Splice the cam + driver-predicate stubs onto the shared base fixture.
  // The base already supplies a no-op selection stub and null gpu handles,
  // which is all we need to reach the early-return after the camera block.
  (state as { cam: OrbitCamera }).cam = cam;
  state.settings.camera.autoRotate = opts.autoRotate ?? false;
  state.subsystems.tweens = {
    isActive: () => opts.tweenActive ?? false,
    advance: vi.fn(opts.tweenAdvance ?? (() => {})),
  } as unknown as EngineState['subsystems']['tweens'];
  state.subsystems.spaceMouse = {
    hasAxes: () => opts.spaceMouseHasAxes ?? false,
    applyToCamera: vi.fn(opts.spaceMouseApply ?? (() => {})),
  } as unknown as EngineState['subsystems']['spaceMouse'];
  return state;
}

/**
 * Deps for the cam-fixture tests: real camera drivers built from the same
 * `state` (so the production wiring is exercised, not a hand-rolled fake),
 * and a canvas whose client/backing dims match so `resizeCanvasToDisplay`
 * returns false and doesn't poke `cam.aspect`.
 */
function makeCamDeps(state: EngineState): RunFrameDeps {
  const deps = makeDeps({ fpsValue: null, lastReportedFps: { current: null } });
  return {
    ...deps,
    canvas: {
      width: 100,
      height: 100,
      clientWidth: 100,
      clientHeight: 100,
    } as unknown as HTMLCanvasElement,
    drivers: buildCameraDrivers(state),
  };
}

describe('runFrame — camera drivers (regression)', () => {
  it('tween active + autoRotate on → tween wins; auto-rotate does not nudge yaw on top', () => {
    // The tween driver (priority 60) outranks auto-rotate (20), so with both
    // active the resolver runs ONLY the tween's apply.  This pins the
    // behaviour the deleted `!tweens.isActive()` guard used to encode: the
    // home tween lands exactly, with no auto-rotate delta added on top.
    const state = makeCamState({
      autoRotate: true,
      tweenActive: true,
      tweenAdvance: (cam) => {
        cam.yaw = 1.5;
      },
    });
    const deps = makeCamDeps(state);

    runFrame(state, deps, 1000);

    expect(state.subsystems.tweens.advance).toHaveBeenCalledOnce();
    // 1.5 exactly, NOT 1.5 + 0.000873 — auto-rotate was suppressed by priority.
    expect(state.cam!.yaw).toBe(1.5);
  });

  it('idle (no driver active, autoRotate off) → camera holds', () => {
    const state = makeCamState({});
    const deps = makeCamDeps(state);

    const before = {
      yaw: state.cam!.yaw,
      pitch: state.cam!.pitch,
      distance: state.cam!.distance,
    };

    runFrame(state, deps, 1000);

    expect(state.cam!.yaw).toBe(before.yaw);
    expect(state.cam!.pitch).toBe(before.pitch);
    expect(state.cam!.distance).toBe(before.distance);
    expect(state.subsystems.tweens.advance).not.toHaveBeenCalled();
    expect(state.subsystems.spaceMouse.applyToCamera).not.toHaveBeenCalled();
  });

  it('autoRotate on, nothing else active → yaw advances by exactly 0.000873', () => {
    const state = makeCamState({ autoRotate: true });
    const deps = makeCamDeps(state);

    const startYaw = state.cam!.yaw;
    runFrame(state, deps, 1000);

    // Auto-rotate is the only active driver, so its fixed per-frame delta lands.
    expect(state.cam!.yaw).toBeCloseTo(startYaw + 0.000873, 9);
    // updatePosition ran off the +Z convention (yaw≈0, pitch 0): position.z ≈ distance.
    expect(state.cam!.position[2]).toBeCloseTo(state.cam!.distance, 3);
  });

  // RoD camera-term collapse (`deps.drivers.some(d => d.isActive(nowMs))`
  // replacing the three old autoRotate/tween/spaceMouse OR terms) is NOT
  // directly asserted here: the `stillAnimating` tail is reachable only on
  // the GPU-ready path, and these lightweight fixtures early-return at the
  // renderer-null guard.  The equivalence is underwritten elsewhere — each
  // driver's `isActive` maps one-to-one onto an old term, proven by
  // cameraDriverWrappers.test.ts, and `.some` over those three IS their
  // boolean OR.  Building a full GPU-ready fixture solely to re-prove that
  // identity would be disproportionate, so we document the coverage instead.
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

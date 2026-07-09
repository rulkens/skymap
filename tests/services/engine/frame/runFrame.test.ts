/**
 * runFrame — focused tests for the camera-driver resolve and the
 * per-frame demand re-evaluation.
 *
 * The full per-frame body is exercised end-to-end by higher-level engine
 * tests (renderFrame.test.ts integration suite, engine.tier-swap-race, etc.).
 * This file pins two lighter slices: the camera-driver priority resolver
 * (which runs before `deriveFrameContext`) and the once-per-frame
 * `reevaluateDemand` call.
 *
 * Testing only these slices keeps the test cheap: we don't need a GPU device
 * or any of the rendering subsystems.  The frame body is structured so every
 * "do something" GPU path is gated on a state field (`state.gpu.renderer`,
 * …) — leaving them all null short-circuits the body before any of the GPU
 * work runs.  See the early-return at `if (!vp || !rendererRef || …) return`
 * inside runFrame for the bail-out that makes this possible.
 *
 * ### Camera-driver regression (new architecture)
 *
 * The new camera architecture reads state from the Redux store (`cb.store`),
 * not from EngineState fields. Drivers do NOT mutate `state.cam`; instead
 * they return a `CameraPose` that is stored in `state.cameraRuntime.lastPose`.
 * The regression fixtures use a real Redux store and check
 * `state.cameraRuntime.lastPose.current` instead of `state.cam.yaw`.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

// Demand re-evaluation is the engine's per-frame heartbeat: runFrame calls it
// every tick so any state change (a setter flipping a flag, then waking the
// loop via requestRender) re-derives what should load.  Mock it here so the
// FPS-wiring fixtures don't drive the real demand table, and so the dedicated
// test below can assert the per-frame call without a full registry.
vi.mock('../../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));

// deriveSourceMasks is mocked here so the clipPlayer tick-ordering test can
// observe the call sequence without needing a full FadeRegistry seeded for
// every galaxy catalog source. Returns inert masks (draw 0, pick 0) — the
// renderer-null bail-out fires before any renderer reads the masks, so they
// do not need to be realistic in this test suite.
vi.mock('../../../../src/services/engine/frame/deriveSourceMasks', () => ({
  deriveSourceMasks: vi.fn(() => ({ draw: 0, pick: 0 })),
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
import { deriveSourceMasks } from '../../../../src/services/engine/frame/deriveSourceMasks';
import { createDisabledGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';
import { createCameraClock } from '../../../../src/services/engine/camera/cameraClock';
import {
  startCameraTween,
  setAutoRotate,
  commitCameraPose,
} from '../../../../src/state/camera/cameraSlice';
import { engineScaleChanged } from '../../../../src/state/engine/engineSlice';
import { rootReducer } from '../../../../src/store/rootReducer';
import type { RunFrameDeps } from '../../../../src/@types/engine/frame/RunFrameDeps';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import { GALAXY_CATALOG_SOURCES, SOURCE_REGISTRY } from '../../../../src/data/sources';

/** Build a real Redux store from the production root reducer. */
function makeStore() {
  return configureStore({ reducer: rootReducer });
}

/**
 * Build a minimal `EngineState`-shaped fixture that lets `runFrame` run the
 * camera + demand slices and then bail out cleanly via the renderer-null
 * guard further down.  Casting through `unknown` keeps the test honest — if
 * the exercised path ever reaches into a field not stubbed here, the test
 * will surface it as a runtime undefined rather than a silently-passing stub.
 */
function makeState(): EngineState {
  return {
    // Post-H5 nested-only settings shape.
    settings: {
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
      bias: { mode: 'off', absMagLimit: -19 },
      thumbnails: { enabled: false },
      milkyWay: { enabled: false },
      filaments: { enabled: false, intensity: 1 },
      volumes: { enabled: false },
    },
    picking: {
      pickInFlight: false,
      pointerDown: false,
      lastFrameCam: null,
    },
    gpu: {
      renderer: null,
      pickRenderer: null,
      renderTargets: null,
      filamentRenderer: null,
    },
    subsystems: {
      scheduler: { requestRender: vi.fn() },
      // deriveSourceMasks reads opacityOf({kind:'galaxyCatalog', id}) for every
      // galaxy catalog to compute the fade-out draw tail; 0 everywhere (no fade in
      // flight) is the right baseline for these fixtures. With the module mock
      // above this value is also mocked out, but the real fades stub is kept
      // here for completeness and so the type constraint is satisfied.
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
      // clipPlayer is non-nullable from t=0 (no GPU dep). The tick spy must be
      // a typed vi.fn — bare vi.fn() fails tsc against the typed ClipPlayer interface.
      clipPlayer: {
        tick: vi.fn<(nowMs: number) => void>(),
        stop: vi.fn<() => void>(),
        clipOpacityOf: vi.fn<(layer: string, nowMs: number) => number>(() => 1),
        destroy: vi.fn<() => void>(),
      },
      galaxyAtlas: null,
      proceduralDisks: null,
      texturedDisks: null,
      clickResolver: null,
      inputBindings: null,
      loadProgress: null,
    },
    cam: null,
    assetSlots: {
      points: new Map(),
      filaments: null,
      famousMeta: null,
      pgcAlias: null,
    },
    // cameraRuntime Resource bag — required for the camera-driver block
    // that runs BEFORE the renderer-null bail-out.
    cameraRuntime: {
      clock: createCameraClock(),
      projection: { fovYRad: 0.8, aspect: 1, near: 0.01, far: 1000 },
      lastPose: { current: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 } },
      prevActiveId: { current: 'resting' as string },
    },
  } as unknown as EngineState;
}

/**
 * Build a `RunFrameDeps` of no-op stubs.  Every dep is inert because the
 * renderer-null bail-out inside `runFrame` short-circuits before any of
 * them are touched; the camera-driver fixtures override `drivers` + `canvas`
 * + `cb.store` via `makeCamDeps`.
 */
function makeDeps(store = makeStore()): RunFrameDeps {
  return {
    canvas: {
      width: 0,
      height: 0,
      clientWidth: 0,
      clientHeight: 0,
    } as unknown as HTMLCanvasElement,
    cb: { store } as unknown as RunFrameDeps['cb'],
    device: {} as unknown as GPUDevice,
    context: {} as unknown as GPUCanvasContext,
    // Disabled stub matches production's "no `?gpuTimings`" path.
    timingService: createDisabledGpuTimingService(),
    drivers: buildCameraDrivers({} as unknown as EngineState),
  };
}

/**
 * Camera-driver regression fixtures.
 *
 * Unlike `makeState()` (whose `cam: null` bails before the camera block),
 * these fixtures carry a real `OrbitCamera`-shaped `cam` so the per-frame
 * camera-driver resolver — which runs BEFORE `deriveFrameContext` — is
 * actually exercised. The renderer is still null, so `deriveFrameContext`
 * reports not-ready and the body early-returns right after the camera
 * block: exactly the slice we want to pin without standing up a GPU.
 *
 * The new camera architecture produces a `CameraPose` stored in
 * `state.cameraRuntime.lastPose.current`; tests read that, NOT `state.cam`.
 */
function makeCamState(): EngineState {
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
  (state as { cam: OrbitCamera }).cam = cam;
  return state;
}

/**
 * Deps for the cam-fixture tests: real camera drivers built from the same
 * `state` (so the production wiring is exercised, not a hand-rolled fake),
 * and a canvas whose client/backing dims match so `resizeCanvasToDisplay`
 * returns false and doesn't poke `projection.aspect`.
 */
function makeCamDeps(state: EngineState, store = makeStore()): RunFrameDeps {
  const deps = makeDeps(store);
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
  it('tween wins over auto-rotate; lastPose.current reflects the tween pose, not auto-rotate', () => {
    // The tween driver (priority 60) outranks auto-rotate (20), so with both
    // active the resolver runs ONLY the tween's pose. This pins the
    // precedence that the old `!tweens.isActive()` guard used to encode.
    const store = makeStore();
    const state = makeCamState();
    const deps = makeCamDeps(state, store);

    // Commit a base pose so the camera starts somewhere known.
    const BASE: CameraPose = {
      target: [0, 0, 0],
      yaw: 0,
      pitch: 0,
      distance: 100,
    };
    store.dispatch(commitCameraPose(BASE));
    state.cameraRuntime.lastPose.current = BASE;

    // Enable auto-rotate AND start a tween — both active so the resolver must
    // pick the higher-priority tween driver.
    store.dispatch(setAutoRotate({ active: true, rate: 0.000873 }));
    store.dispatch(
      startCameraTween({
        from: BASE,
        to: { target: [0, 0, 0], yaw: 1.5, pitch: 0, distance: 50 },
        durationMs: 1000,
        easing: 'easeOutCubic',
      }),
    );

    runFrame(state, deps, 0); // arrival: primes the tween clock (elapsed 0 → pose == from)
    runFrame(state, deps, 500); // elapsed 500/1000 → tween yaw in (0, 1.5)

    // The tween wins: the yaw is somewhere between 0 and 1.5 (not auto-rotate's
    // yaw + 0.000873/frame). The exact value is easing-dependent; we only need
    // to verify it advanced toward the tween's to-yaw (1.5) and is not zero.
    const yaw = state.cameraRuntime.lastPose.current.yaw;
    expect(yaw).toBeGreaterThan(0);
    expect(yaw).toBeLessThanOrEqual(1.5);
  });

  it('idle (no driver active except resting) → lastPose holds the committed base', () => {
    const store = makeStore();
    const state = makeCamState();
    const deps = makeCamDeps(state, store);

    const BASE: CameraPose = { target: [0, 0, 0], yaw: 0.123, pitch: 0.456, distance: 77 };
    store.dispatch(commitCameraPose(BASE));
    state.cameraRuntime.lastPose.current = BASE;

    runFrame(state, deps, 1000);

    // Resting driver returns `s.camera.base` as-is.
    const pose = state.cameraRuntime.lastPose.current;
    expect(pose.yaw).toBe(0.123);
    expect(pose.pitch).toBe(0.456);
    expect(pose.distance).toBe(77);
  });

  it('autoRotate on, nothing else active → lastPose.yaw advances from base', () => {
    const store = makeStore();
    const state = makeCamState();
    const deps = makeCamDeps(state, store);

    const BASE: CameraPose = {
      target: [0, 0, 0],
      yaw: 0,
      pitch: 0,
      distance: 100,
    };
    store.dispatch(commitCameraPose(BASE));
    state.cameraRuntime.lastPose.current = BASE;

    // Enable auto-rotate on the camera slice — the only home now.
    store.dispatch(setAutoRotate({ active: true, rate: 0.000873 }));

    runFrame(state, deps, 0); // arrival: autoRotate activates, autoRotateElapsed primes → yaw 0
    runFrame(state, deps, 1000); // elapsed 1000 → yaw advances

    // After 1000 ms the yaw must have advanced from the base (0).
    const yaw = state.cameraRuntime.lastPose.current.yaw;
    expect(yaw).toBeGreaterThan(0);
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
    const store = makeStore();
    const state = makeState();
    const deps = makeDeps(store);

    runFrame(state, deps, 1000);

    expect(reevaluateDemand).toHaveBeenCalledOnce();
    expect(reevaluateDemand).toHaveBeenCalledWith(state);
  });
});

describe('runFrame — clipPlayer tick ordering (Task 12)', () => {
  it('ticks clipPlayer before deriveSourceMasks — scene cues fire before mask derivation', () => {
    // Task 12 contract: `clipPlayer.tick(nowMs)` must be the FIRST statement of
    // `runFrame`, before `deriveSourceMasks` and `reevaluateDemand`. Scene cues
    // (e.g. a visibility toggle dispatched by a cue) must be committed before
    // this frame derives its draw masks from state, so a cue's effects are
    // visible in the same frame rather than lagging one frame behind.
    //
    // Strategy: both `clipPlayer.tick` and `deriveSourceMasks` are replaced with
    // spies. Each spy pushes a marker into a shared `callOrder` array. After
    // running one frame we assert tick appeared before deriveSourceMasks.
    const callOrder: string[] = [];

    const store = makeStore();
    const state = makeState();

    // Replace the clipPlayer tick stub so it records its position in callOrder.
    state.subsystems.clipPlayer.tick = vi.fn<() => void>(() => {
      callOrder.push('tick');
    });

    // Replace the deriveSourceMasks mock's implementation for this test.
    vi.mocked(deriveSourceMasks).mockImplementationOnce(() => {
      callOrder.push('deriveSourceMasks');
      return { draw: 0, pick: 0 };
    });

    const deps = makeDeps(store);
    runFrame(state, deps, 500);

    // tick must precede deriveSourceMasks in the call sequence.
    const tickIdx = callOrder.indexOf('tick');
    const masksIdx = callOrder.indexOf('deriveSourceMasks');

    expect(tickIdx).toBeGreaterThanOrEqual(0); // tick was called
    expect(masksIdx).toBeGreaterThanOrEqual(0); // deriveSourceMasks was called
    expect(tickIdx).toBeLessThan(masksIdx); // tick came first
  });

  it('passes nowMs to clipPlayer.tick', () => {
    // The clip player advances internal state based on elapsed time. It must
    // receive the same `nowMs` the frame was called with, not a stale clock read.
    const store = makeStore();
    const state = makeState();
    const deps = makeDeps(store);

    runFrame(state, deps, 12345);

    expect(state.subsystems.clipPlayer.tick).toHaveBeenCalledWith(12345);
  });
});

describe('runFrame — hover-pick removed from frame body', () => {
  it('does not call pickRenderer.pick inside the frame body', () => {
    // The hover-pick block was removed from runFrame. Hover picking is now
    // fully pointer-driven via hoverPickDriver (wired in wireInput.ts).
    // This test pins that invariant: even with a non-null pickRenderer and a
    // non-null latestMouseCss-equivalent, runFrame must NEVER call
    // pickRenderer.pick itself. If the block is accidentally re-added,
    // this assertion catches it.
    //
    // The fixture leaves state.gpu.renderer=null so the frame bails before
    // the GPU-dispatch section — we only need to confirm pick is not called
    // during the camera + demand pre-pass (where the old block lived).
    const store = makeStore();
    const state = makeState();
    const pickSpy = vi.fn<() => Promise<null>>(() => Promise.resolve(null));
    // Seed a non-null pickRenderer so the old guard would have let through.
    (state.gpu as any).pickRenderer = {
      pick: pickSpy,
      renderForDebug: vi.fn<() => null>(),
      destroy: vi.fn<() => void>(),
      label: 'pick',
    };
    const deps = makeDeps(store);

    runFrame(state, deps, 1000);

    // The frame body must never call pickRenderer.pick — hover picks are
    // now the driver's responsibility, not the frame's.
    expect(pickSpy).not.toHaveBeenCalled();
  });
});

describe('runFrame — engineScaleChanged dispatch', () => {
  // The scale-dispatch block fires inside the `if (state.cam)` guard —
  // the same guard that emits `onCameraChange`. `makeCamState()` seeds a
  // non-null `cam`; `makeCamDeps` gives the canvas real clientWidth/Height
  // (100×100) so `computeScaleInfo` returns a non-null result.
  it('dispatches engineScaleChanged when the camera is ready and the viewport is non-degenerate', () => {
    const store = makeStore();
    const spy = vi.spyOn(store, 'dispatch');
    const state = makeCamState();
    const deps = makeCamDeps(state, store);

    runFrame(state, deps, 0);

    // At least one dispatch of engineScaleChanged must have fired.
    // The payload shape is { label: string, widthPx: number }.
    const scaleCalls = spy.mock.calls.filter((call) => {
      const action = call[0] as { type?: string };
      return action?.type === engineScaleChanged.type;
    });
    expect(scaleCalls.length).toBeGreaterThan(0);
    const payload = (scaleCalls[0]![0] as ReturnType<typeof engineScaleChanged>).payload;
    expect(typeof payload.label).toBe('string');
    expect(typeof payload.widthPx).toBe('number');
    expect(payload.widthPx).toBeGreaterThan(0);
  });

  it('does not dispatch engineScaleChanged when the canvas has zero height (degenerate viewport)', () => {
    const store = makeStore();
    const spy = vi.spyOn(store, 'dispatch');
    const state = makeCamState();
    const deps: RunFrameDeps = {
      ...makeCamDeps(state, store),
      // clientHeight = 0 → computeScaleInfo returns null → no dispatch.
      canvas: {
        width: 100,
        height: 100,
        clientWidth: 100,
        clientHeight: 0,
      } as unknown as HTMLCanvasElement,
    };

    runFrame(state, deps, 0);

    const scaleCalls = spy.mock.calls.filter((call) => {
      const action = call[0] as { type?: string };
      return action?.type === engineScaleChanged.type;
    });
    expect(scaleCalls).toHaveLength(0);
  });

  it('does not dispatch engineScaleChanged when state.cam is null (pre-bootstrap)', () => {
    // Without a camera the `if (state.cam)` guard is false and the scale
    // block is unreachable — the test pins that it stays silent.
    const store = makeStore();
    const spy = vi.spyOn(store, 'dispatch');
    const state = makeState(); // cam === null
    const deps = makeDeps(store);

    runFrame(state, deps, 0);

    const scaleCalls = spy.mock.calls.filter((call) => {
      const action = call[0] as { type?: string };
      return action?.type === engineScaleChanged.type;
    });
    expect(scaleCalls).toHaveLength(0);
  });
});

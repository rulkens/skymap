/**
 * runFrame — focused tests for the camera-driver resolve and the per-frame demand re-evaluation.
 *
 * The full body is covered end-to-end elsewhere (renderFrame.test.ts, engine.tier-swap-race). Every
 * GPU path sits behind `isEngineReady`, so a `booted: false` / null `gpu.renderTargets` fixture
 * short-circuits before any GPU work. Camera state lives in the Redux store (`cb.store`): a driver's
 * `CameraPose` lands in `state.cameraRuntime.register.pose`, which the fixtures read.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

// Mocked so the FPS-wiring fixtures don't drive the real demand table and the dedicated test can
// assert the per-frame call (runFrame calls it every tick so any state change re-derives loads).
vi.mock('../../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));

// Real WebGPU calls against `deps.device`/`deps.context` that no JSDOM stub can service; mocked so
// the wake-fold test can drive `runFrame` through a READY frame.
vi.mock('../../../../src/services/engine/frame/renderFrame', () => ({
  renderFrame: vi.fn(),
}));
vi.mock('../../../../src/services/engine/frame/drawPickDebugOverlay', () => ({
  drawPickDebugOverlay: vi.fn(),
}));

// resizeCanvasToDisplay reads window.devicePixelRatio (undefined in node); stubbed to a no-op false
// since resize is incidental to the camera-driver tests. runFrame imports only that symbol.
vi.mock('../../../../src/services/gpu/device', () => ({
  resizeCanvasToDisplay: () => false,
}));

// deriveBodyStates is wrapped, not replaced: the sim-clock test records the instant runFrame primes
// the body snapshot at and proves that prime runs BEFORE the camera produce step. It delegates to
// the REAL derive and appends the instant to a hoisted log the stub driver's pose() also writes to,
// so one array captures derive→produce order.
const timeOrder = vi.hoisted(() => ({ log: [] as string[] }));
vi.mock('../../../../src/services/engine/frame/deriveBodyStates', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/services/engine/frame/deriveBodyStates')>();
  return {
    ...actual,
    deriveBodyStates: vi.fn((simDays: number) => {
      timeOrder.log.push(`derive:${simDays}`);
      return actual.deriveBodyStates(simDays);
    }),
  };
});

import { IDLE_SURFACE_TILE_PLAN } from '../../../../src/data/bodies/idleSurfaceTilePlan';
import { runFrame } from '../../../../src/services/engine/frame/runFrame';
import { renderFrame } from '../../../../src/services/engine/frame/renderFrame';
import { CAMERA_DRIVERS } from '../../../../src/services/engine/camera/cameraDrivers';
import { NAV_AT_REST } from '../../../../src/data/camera/openSpaceNavigation';
import { composeControlSchemes } from '../../../../src/services/engine/camera/composeControlSchemes';
import { reevaluateDemand } from '../../../../src/services/engine/wiring/reevaluateDemand';
import { createDisabledGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';
import { UNSTARTED_EPOCHS } from '../../../../src/services/engine/camera/cameraEpochs';
import {
  startCameraTween,
  setAutoRotate,
  commitCameraPose,
  startFrameTween,
} from '../../../../src/state/camera/cameraSlice';
import { setOrientation } from '../../../../src/state/settings/core/orientationSlice';
import {
  ORIENTATION_FRAMES,
  ORIENTATION_FRAME_QUATERNIONS,
} from '../../../../src/data/orientation/orientationFrames';
import { assembleOrbitCamera } from '../../../../src/services/engine/camera/assembleOrbitCamera';
import { frameUp } from '../../../../src/utils/camera/frameUp';
import { computeViewProj } from '../../../../src/utils/camera/computeViewProj';
import { engineScaleChanged } from '../../../../src/state/engine/engineSlice';
import { setSimDays } from '../../../../src/state/time/timeSlice';
import { rootReducer } from '../../../../src/store/rootReducer';
import type { RunFrameDeps } from '../../../../src/@types/engine/frame/RunFrameDeps';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { CameraDriver } from '../../../../src/@types/engine/camera/CameraDriver';
import type { DriverId } from '../../../../src/@types/engine/camera/DriverId';
import type { ClipPlayer } from '../../../../src/@types/engine/subsystems/ClipPlayer';
import type { FrameContentPlanner } from '../../../../src/@types/engine/frame/FrameContentPlanner';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { DEFAULT_GALAXY_PROVENANCE } from '../../../../src/layers/galaxyCatalog/state/defaults';
import { createStructureFocusSubsystem } from '../../../../src/services/engine/subsystems/structureFocusSubsystem';
import {
  inputSourceAttached,
  inputGestureStarted,
  inputMoved,
  inputConsumed,
} from '../../../../src/state/input/inputSlice';
import { EMPTY_SURFACE_GESTURE_MEMORY } from '../../../../src/services/camera/surfaceStep';
import { EMPTY_TILT_MEMORY } from '../../../../src/data/camera/emptyTiltMemory';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { worldArmOf } from '../../../fixtures/worldArmOf';
import { earthArm } from '../../../fixtures/earthArm';
import { makeCameraSimHarness } from '../../../helpers/camera/makeCameraSimHarness';
import { readFollowMemory } from '../../../helpers/camera/readFollowMemory';
import { makeCubemapCaptureRuntimes } from '../../../helpers/engine/makeCubemapCaptureRuntimes';
import GOLDEN from '../../../fixtures/camera/driverGoldenTrace.json';
import type { RootState } from '../../../../src/store/types';
import { symmetricFrustum } from '../../../../src/utils/camera/symmetricFrustum';
import { FLAT_TERRAIN } from '../../../../src/data/camera/flatTerrain';

function makeStore() {
  return configureStore({ reducer: rootReducer });
}

/** `earthArm` measures in Earth radii; the scale-bar case reads back in km. */
const EARTH_RADIUS_KM = 6371;

/** Minimal `EngineState`-shaped fixture; casting through `unknown` makes a read of any unstubbed
 *  field surface as a runtime undefined rather than a silently-passing stub. */
function makeState(): EngineState {
  return {
    settings: {
      // Read unconditionally at the top of the resize block, before the
      // renderer-null bail-out — see `runFrame`'s fovYRad write.
      camera: { fovDeg: 60 },
      galaxyCatalogs: {
        enabled: true,
        sizePx: 2,
        brightness: 0.5,
        depthFade: false,
        provenance: DEFAULT_GALAXY_PROVENANCE,
      },
      tonemap: { exposure: 1, curve: 'linear' },
      bias: { mode: 'off', absMagLimit: -19 },
      thumbnails: { enabled: false },
      // aggregateDivisor is what the `mw-aggregate` row's `scale` function
      // resolves on every reconcile, so the fixture carries its boot value
      // rather than leaving that reader to resolve undefined.
      milkyWay: { enabled: false, aggregateDivisor: 2 },
      cosmicWebFilaments: { enabled: false, intensity: 1 },
      cosmicWebDensity: { enabled: false },
    },
    picking: {
      pickInFlight: false,
    },
    gpu: {
      galaxyPointRenderer: null,
      galaxyPickRenderer: null,
      renderTargets: null,
    },
    subsystems: {
      scheduler: { requestRender: vi.fn() },
      fades: { opacityOf: () => 0 },
      selection: {
        hovered: () => null,
        selected: () => null,
        focused: () => null,
        setHovered: vi.fn(),
        setSelected: vi.fn(),
        setFocused: vi.fn(),
        destroy: vi.fn(),
      },
      clipPlayer: {
        tick: vi.fn<ClipPlayer['tick']>((clipEpoch) => ({ clipEpoch })),
        stop: vi.fn<() => void>(),
        clipOpacityOf: vi.fn<(layer: string, nowMs: number) => number>(() => 1),
        destroy: vi.fn<() => void>(),
      },
      galaxyAtlas: null,
      proceduralDisks: null,
      texturedDisks: null,
      pickDriver: null,
      resizeWake: null,
      loadProgress: null,
    },
    booted: false,
    viewRig: 'mono',
    terrain: FLAT_TERRAIN,
    cameraRuntime: {
      register: {
        pose: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 }),
        winner: 'resting',
      },
      base: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 }),
      // Must match the store's orientation, or frame one reads a phantom switch.
      orientation: DEFAULT_ORIENTATION,
      epochs: UNSTARTED_EPOCHS,
      follow: null,
      gesture: EMPTY_SURFACE_GESTURE_MEMORY,
      tilt: EMPTY_TILT_MEMORY,
      navigator: NAV_AT_REST,
      scheme: 'skymap',
      own: {},
      pivotBody: null,
      outputs: {
        displayed: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 }),
        simDays: 0,
        upBasis: [...ORIENTATION_FRAMES.ecliptic],
        projection: { fovYRad: 0.8, aspect: 1, near: 0.01, far: 1000 },
      },
    },
    label3DProducers: [],
    // Read unconditionally by `runFrame`'s NEAR0 altitude line, before the
    // ready gate.
    selectionRows: { focus: null },
  } as unknown as EngineState;
}

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
    timingService: createDisabledGpuTimingService(),
    controlSchemes: composeControlSchemes([]),
  };
}

// Booted fixtures: unlike `makeState()` they exercise the camera-driver resolver, which runs BEFORE
// `deriveFrameContext`. The renderer is still null, so the body early-returns right after the camera
// block; the produced pose is read from `state.cameraRuntime.register.pose`.
function makeCamState(): EngineState {
  const state = makeState();
  state.booted = true;
  return state;
}

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
    controlSchemes: composeControlSchemes([]),
  };
}

describe('runFrame — the input drain runs before the produce step', () => {
  it('applies this frame’s queued gesture to the pose this frame renders', () => {
    // The replay sits above the produce step. Move it below — a plausible
    // reorder in any future runFrame edit — and every grab costs a frame: the
    // first frame of a drag is produced from the pre-drag register. Nothing
    // else in the suite sees it.
    const store = makeStore();
    const state = makeCamState();
    const deps = makeCamDeps(state, store);

    const BASE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 };
    store.dispatch(commitCameraPose(absoluteArm(BASE)));
    state.cameraRuntime = {
      ...state.cameraRuntime,
      register: { ...state.cameraRuntime.register, pose: absoluteArm(BASE) },
    };
    // px (100, 100) → (150, 100) on the 100 × 100 canvas, in source units.
    store.dispatch(inputSourceAttached({ source: 'canvas', aspect: 1 }));
    store.dispatch(inputGestureStarted({ source: 'canvas', intent: 'orbit' }));
    const motion = {
      intent: 'orbit',
      dx: 0.5,
      dy: 0,
      ratio: 1,
      at: { x: 1.5, y: 1 },
      held: true,
    } as const;
    store.dispatch(inputMoved({ source: 'canvas', motion: [motion] }));

    runFrame(state, deps, 0);

    // Drag right 50 px at the flat 0.005 rad/px (no pivot to damp against).
    expect(worldArmOf(state.cameraRuntime.register.pose).yaw).toBeCloseTo(-0.25, 6);
  });
});

describe('runFrame — camera drivers (regression)', () => {
  it('tween wins over auto-rotate; register.pose reflects the tween pose, not auto-rotate', () => {
    // The tween driver (priority 60) outranks auto-rotate (20), so with both active only the tween's pose runs.
    const store = makeStore();
    const state = makeCamState();
    const deps = makeCamDeps(state, store);

    const BASE: CameraPose = {
      target: [0, 0, 0],
      yaw: 0,
      pitch: 0,
      distance: 100,
    };
    store.dispatch(commitCameraPose(absoluteArm(BASE)));
    state.cameraRuntime = {
      ...state.cameraRuntime,
      register: { ...state.cameraRuntime.register, pose: absoluteArm(BASE) },
    };

    store.dispatch(setAutoRotate({ active: true, rate: 0.000873 }));
    store.dispatch(
      startCameraTween({
        from: BASE,
        to: { target: [0, 0, 0], yaw: 1.5, pitch: 0, distance: 50 },
        durationMs: 1000,
        easing: 'easeOutCubic',
        frame: DEFAULT_ORIENTATION,
      }),
    );

    runFrame(state, deps, 0); // arrival: primes the tween clock (elapsed 0 → pose == from)
    runFrame(state, deps, 500); // elapsed 500/1000 → tween yaw in (0, 1.5)

    // The tween wins: yaw is between 0 and 1.5 (not auto-rotate's yaw + 0.000873/frame); the exact value is easing-dependent.
    const yaw = worldArmOf(state.cameraRuntime.register.pose).yaw;
    expect(yaw).toBeGreaterThan(0);
    expect(yaw).toBeLessThanOrEqual(1.5);
  });

  it('idle (no driver active except resting) → register.pose holds the committed base', () => {
    const store = makeStore();
    const state = makeCamState();
    const deps = makeCamDeps(state, store);

    const BASE: CameraPose = { target: [0, 0, 0], yaw: 0.123, pitch: 0.456, distance: 77 };
    store.dispatch(commitCameraPose(absoluteArm(BASE)));
    state.cameraRuntime = {
      ...state.cameraRuntime,
      register: { ...state.cameraRuntime.register, pose: absoluteArm(BASE) },
    };

    runFrame(state, deps, 1000);

    const pose = worldArmOf(state.cameraRuntime.register.pose);
    expect(pose.yaw).toBe(0.123);
    expect(pose.pitch).toBe(0.456);
    expect(pose.distance).toBe(77);
  });

  it('autoRotate on, nothing else active → register.pose yaw advances from base', () => {
    const store = makeStore();
    const state = makeCamState();
    const deps = makeCamDeps(state, store);

    const BASE: CameraPose = {
      target: [0, 0, 0],
      yaw: 0,
      pitch: 0,
      distance: 100,
    };
    store.dispatch(commitCameraPose(absoluteArm(BASE)));
    state.cameraRuntime = {
      ...state.cameraRuntime,
      register: { ...state.cameraRuntime.register, pose: absoluteArm(BASE) },
    };

    store.dispatch(setAutoRotate({ active: true, rate: 0.000873 }));

    runFrame(state, deps, 0); // arrival: autoRotate wins, its epoch starts → yaw 0
    runFrame(state, deps, 1000); // elapsed 1000 → yaw advances

    const yaw = worldArmOf(state.cameraRuntime.register.pose).yaw;
    expect(yaw).toBeGreaterThan(0);
  });
});

describe('runFrame — follow memory', () => {
  it('drops the follow memory when the focus row changes', () => {
    // The strafe offset belongs to ONE focus row: a new row is a fresh target
    // and must not inherit the old body's pan.
    const h = makeCameraSimHarness({ focusBody: 'earth' });
    h.frame(2);
    h.state.cameraRuntime = {
      ...h.state.cameraRuntime,
      follow: { ...readFollowMemory(h.state), panOffset: [1, 2, 3] },
    };

    h.focus('mars');
    h.frame();

    expect(readFollowMemory(h.state).panOffset).toEqual([0, 0, 0]);
  });
});

describe('runFrame — orientation-frame roll', () => {
  // Vector helpers local to this suite. The assembled camera exposes world
  // `position`; the frame pole is `frameUp(B(t))` (middle column of the basis).
  const sub = (a: readonly number[], b: readonly number[]): number[] => [
    a[0]! - b[0]!,
    a[1]! - b[1]!,
    a[2]! - b[2]!,
  ];
  const norm = (v: readonly number[]): number => Math.hypot(v[0]!, v[1]!, v[2]!);
  const dot = (a: readonly number[], b: readonly number[]): number =>
    a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const angleBetween = (a: readonly number[], b: readonly number[]): number => {
    const c = dot(a, b) / (norm(a) * norm(b));
    return Math.acos(Math.min(1, Math.max(-1, c)));
  };

  it('a full orientation-frame roll: B(t) reaches the destination pole monotonically and the descriptor clears on completion', () => {
    // Not a produce-path test (see 'during a frame roll the assembled camera position is unchanged...'
    // for the committed-vs-live basis split). Drives a real frameTween through `runFrame` and reads a
    // SYNTHETIC probe camera, `assembleOrbitCamera(pose, projection, B, B)` with the live B(t) in both
    // slots, to confirm what nothing else pins: (1) B(t) rotates MONOTONICALLY from the old pole to the
    // new across a full 0→1000ms sweep (`resolveFrameBasis.test.ts` checks orthonormality and endpoints
    // only, so a slerp-direction bug could pass it); (2) `runFrame`'s completion branch dispatches
    // `clearFrameTween` exactly once when elapsed saturates. The target/distance assertions are
    // byproducts of B(t) being a rotation.
    const store = makeStore();
    const state = makeCamState();
    const deps = makeCamDeps(state, store);

    // A base pose whose view direction is well away from either pole, so the roll
    // is visible and the eye clearly orbits (yaw/pitch both non-trivial).
    const BASE: CameraPose = { target: [0, 0, 0], yaw: 0.7, pitch: 0.3, distance: 100 };
    store.dispatch(commitCameraPose(absoluteArm(BASE)));
    state.cameraRuntime = {
      ...state.cameraRuntime,
      register: { ...state.cameraRuntime.register, pose: absoluteArm(BASE) },
    };

    // Switch ecliptic → galactic over 1 s, linear so the slerp parameter is the
    // raw time fraction (monotonic pole rotation).
    store.dispatch(
      startFrameTween({
        fromQuat: [...ORIENTATION_FRAME_QUATERNIONS.ecliptic],
        to: 'galactic',
        durationMs: 1000,
        easing: 'linear',
      }),
    );

    const projection = state.cameraRuntime.outputs.projection;
    const samples: { t: number; target: number[]; position: number[]; up: number[] }[] = [];
    for (const t of [0, 250, 500, 750, 1000]) {
      runFrame(state, deps, t);
      const B = state.cameraRuntime.outputs.upBasis;
      const cam = assembleOrbitCamera(
        worldArmOf(state.cameraRuntime.register.pose),
        projection,
        B,
        B,
      );
      samples.push({
        t,
        target: [...cam.target],
        position: [...cam.position],
        up: frameUp(B),
      });
    }

    const first = samples[0]!;
    for (const s of samples) {
      expect(norm(sub(s.target, first.target))).toBeLessThan(1e-6);
      // Distance (|position − target|) is preserved — B(t) is a rotation matrix
      // at every sample, so the synthetic probe's eye orbits at constant radius.
      // Relative tolerance: the basis slerp runs in float32, so absolute error
      // scales with `distance` (~1e-5 at 100); the invariant is that the *ratio*
      // holds to float32 precision.
      const rel = Math.abs(norm(sub(s.position, s.target)) - BASE.distance) / BASE.distance;
      expect(rel).toBeLessThan(1e-6);
    }

    expect(angleBetween(first.up, frameUp(ORIENTATION_FRAMES.ecliptic))).toBeLessThan(1e-6);
    expect(
      angleBetween(samples[samples.length - 1]!.up, frameUp(ORIENTATION_FRAMES.galactic)),
    ).toBeLessThan(1e-6);

    const anglesFromStart = samples.map((s) => angleBetween(s.up, first.up));
    for (let i = 1; i < anglesFromStart.length; i++) {
      expect(anglesFromStart[i]!).toBeGreaterThan(anglesFromStart[i - 1]!);
    }
    expect(norm(sub(samples[samples.length - 1]!.position, first.position))).toBeGreaterThan(1);

    expect(store.getState().camera.frameTween).toBeNull();
  });

  it('during a frame roll the assembled camera position is unchanged while its up rotates', () => {
    // A frame switch changes only which way is up. `poseBasis` is the COMMITTED frame
    // (`ORIENTATION_FRAMES[orientation]`, set by `watchOrientationChangeSaga` to the destination the
    // instant a switch starts, so it never moves during the roll); `upBasis` is the live mid-slerp B(t)
    // in `cameraRuntime.outputs.upBasis`. Position holds, up rotates.
    const store = makeStore();
    const state = makeCamState();
    const deps = makeCamDeps(state, store);

    const BASE: CameraPose = { target: [0, 0, 0], yaw: 0.7, pitch: 0.3, distance: 100 };
    store.dispatch(commitCameraPose(absoluteArm(BASE)));
    state.cameraRuntime = {
      ...state.cameraRuntime,
      register: { ...state.cameraRuntime.register, pose: absoluteArm(BASE) },
    };

    store.dispatch(setOrientation('galactic'));
    store.dispatch(
      startFrameTween({
        fromQuat: [...ORIENTATION_FRAME_QUATERNIONS.ecliptic],
        to: 'galactic',
        durationMs: 1000,
        easing: 'linear',
      }),
    );

    const projection = state.cameraRuntime.outputs.projection;

    runFrame(state, deps, 250);
    const cam1 = assembleOrbitCamera(
      worldArmOf(state.cameraRuntime.register.pose),
      projection,
      ORIENTATION_FRAMES.galactic,
      state.cameraRuntime.outputs.upBasis,
    );

    runFrame(state, deps, 500);
    const cam2 = assembleOrbitCamera(
      worldArmOf(state.cameraRuntime.register.pose),
      projection,
      ORIENTATION_FRAMES.galactic,
      state.cameraRuntime.outputs.upBasis,
    );

    // The eye holds still: poseBasis is the committed 'galactic' frame at both
    // samples (it never moved), and the pose (target/yaw/pitch/distance) is
    // unchanged too (resting driver), so position is bit-for-bit identical.
    expect(cam2.position).toEqual(cam1.position);
    expect(frameUp(cam2.upBasis)).not.toEqual(frameUp(cam1.upBasis));
  });

  it('a switch into a near-pole-aligned view resolves to a finite pose at the clamp, not NaN', () => {
    // PITCH_LIMIT edge (spec §10). With the view direction a hair off the frame
    // pole — pitch pinned at the `PITCH_LIMIT` clamp `π/2 − 0.01` — forward and
    // the lookAt up-vector stay 0.01 rad apart through the ENTIRE slerp (B(t) is a
    // rotation, so it rotates forward and up together, preserving their angle). We
    // pin that every produced pose and its view-projection are finite: at exactly
    // π/2 the lookAt would gimbal-lock to NaN, and the clamp is what keeps this
    // switch well-defined.
    const PITCH_LIMIT = Math.PI / 2 - 0.01; // mirrors src/data/camera/pitchLimit.ts
    const store = makeStore();
    const state = makeCamState();
    const deps = makeCamDeps(state, store);

    const BASE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: PITCH_LIMIT, distance: 100 };
    store.dispatch(commitCameraPose(absoluteArm(BASE)));
    state.cameraRuntime = {
      ...state.cameraRuntime,
      register: { ...state.cameraRuntime.register, pose: absoluteArm(BASE) },
    };

    store.dispatch(
      startFrameTween({
        fromQuat: [...ORIENTATION_FRAME_QUATERNIONS.ecliptic],
        to: 'galactic',
        durationMs: 1000,
        easing: 'linear',
      }),
    );

    const projection = state.cameraRuntime.outputs.projection;
    for (const t of [0, 250, 500, 750, 1000]) {
      runFrame(state, deps, t);
      const pose = worldArmOf(state.cameraRuntime.register.pose);
      expect(Number.isFinite(pose.yaw)).toBe(true);
      expect(Number.isFinite(pose.pitch)).toBe(true);
      expect(Math.abs(pose.pitch)).toBeLessThanOrEqual(PITCH_LIMIT + 1e-9);

      const cam = assembleOrbitCamera(
        pose,
        projection,
        state.cameraRuntime.outputs.upBasis,
        state.cameraRuntime.outputs.upBasis,
      );
      for (const c of cam.position) expect(Number.isFinite(c)).toBe(true);
      const vp = computeViewProj(cam, symmetricFrustum(cam.fovYRad, cam.aspect));
      for (const m of vp) expect(Number.isFinite(m)).toBe(true);
    }
  });
});

describe('runFrame — demand re-evaluation', () => {
  it('re-derives demand once per frame', () => {
    // The per-frame call is what lets every setter Just Work: a setter flips its demand-gating state
    // and calls requestRender, the loop wakes, and this re-derivation loads whatever became demanded.
    // No setter has to call reevaluateDemand itself.
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
  it('ticks clipPlayer before reevaluateDemand', () => {
    // `clipPlayer.tick(nowMs)` is the FIRST statement of `runFrame`: a cue's
    // dispatch (e.g. a visibility toggle) must be in the store before this
    // frame derives demand, so its effect shows this frame, not the next.
    const callOrder: string[] = [];

    const store = makeStore();
    const state = makeState();

    state.subsystems.clipPlayer.tick = vi.fn<ClipPlayer['tick']>((clipEpoch) => {
      callOrder.push('tick');
      return { clipEpoch };
    });
    vi.mocked(reevaluateDemand).mockImplementationOnce(() => {
      callOrder.push('reevaluateDemand');
    });

    runFrame(state, makeDeps(store), 500);

    expect(callOrder).toEqual(['tick', 'reevaluateDemand']);
  });

  it('passes nowMs to clipPlayer.tick', () => {
    const store = makeStore();
    const state = makeState();
    const deps = makeDeps(store);

    runFrame(state, deps, 12345);

    expect(state.subsystems.clipPlayer.tick).toHaveBeenCalledWith(expect.anything(), 12345);
  });
});

describe('runFrame — sim clock (Task 8)', () => {
  it('derives simDays from the time intent and primes the body snapshot before the camera produce step', () => {
    // The frame must resolve its sim instant and prime the body snapshot BEFORE it produces the camera
    // pose, so a body-following driver can aim at where the body is THIS frame: (1) the snapshot is
    // derived at the manual clock's instant, (2) the derive precedes the produce step.
    timeOrder.log.length = 0;
    const store = makeStore();
    const NOW = 5000;
    const SCRUBBED = 2_460_000.5; // a manual instant, far from the J2000 seed
    // Manual mode anchored at SCRUBBED with realMs === NOW: deriveSimDays at
    // nowMs=NOW returns exactly SCRUBBED (zero real time elapsed since anchor).
    store.dispatch(setSimDays({ simDays: SCRUBBED, nowMs: NOW }));

    const state = makeCamState();
    // A stub driver that outranks every real driver and records WHEN the produce
    // step runs (the resolver calls only the highest-priority active driver's
    // pose). The renderer stays null, so the frame bails right after produce.
    const stub: CameraDriver = {
      // Not a real row id: `commitOnEdge` resolves `prevWinner` against this
      // list, so a colliding label would shadow the row it names.
      id: 'stub' as DriverId,
      priority: 1000,
      isActive: () => true,
      pose: (_ctx, mem) => {
        timeOrder.log.push('produce');
        return {
          pose: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 }),
          memory: mem,
        };
      },
    };
    const deps: RunFrameDeps = {
      ...makeCamDeps(state, store),
      controlSchemes: { skymap: { drivers: [stub] }, openspace: { drivers: [stub] } },
    };

    runFrame(state, deps, NOW);

    expect(timeOrder.log).toEqual([`derive:${SCRUBBED}`, 'produce']);
  });
});

describe('runFrame — hover-pick removed from frame body', () => {
  it('does not call galaxyPickRenderer.pick inside the frame body', () => {
    // Hover picking is driven by createPickDriver (wireInput.ts); runFrame must never call
    // galaxyPickRenderer.pick. The fixture bails before the GPU-dispatch section, so only the camera +
    // demand pre-pass runs.
    const store = makeStore();
    const state = makeState();
    const pickSpy = vi.fn<() => Promise<null>>(() => Promise.resolve(null));
    (state.gpu as any).galaxyPickRenderer = {
      pick: pickSpy,
      renderForDebug: vi.fn<() => null>(),
      destroy: vi.fn<() => void>(),
      label: 'pick',
    };
    const deps = makeDeps(store);

    runFrame(state, deps, 1000);

    expect(pickSpy).not.toHaveBeenCalled();
  });
});

describe('runFrame — render-target reconcile', () => {
  it('runFrame reconciles the render targets against the live canvas size every frame', () => {
    // The one seam that answers BOTH a canvas resize and a state-driven scale
    // move (the mw-aggregate divisor slider). It is deliberately unconditional:
    // `resizeCanvasToDisplay` is stubbed false for this suite, so a call that
    // only fired inside the resize branch would never happen here. Whether a
    // given row then reallocates is `reconcile`'s own decision, pinned in
    // `renderTargets.test.ts`.
    const store = makeStore();
    const state = makeState();
    const reconcile = vi.fn<(s: EngineState, size: { width: number; height: number }) => void>();
    state.gpu.renderTargets = { reconcile } as unknown as EngineState['gpu']['renderTargets'];
    const deps: RunFrameDeps = {
      ...makeDeps(store),
      canvas: {
        width: 800,
        height: 600,
        clientWidth: 800,
        clientHeight: 600,
      } as unknown as HTMLCanvasElement,
    };

    runFrame(state, deps, 0);

    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledWith(state, { width: 800, height: 600 });
  });
});

describe('runFrame — engineScaleChanged dispatch', () => {
  // The scale-dispatch block fires inside the `if (state.booted)` guard —
  // the same guard that emits `onCameraChange`. `makeCamState()` is booted;
  // `makeCamDeps` gives the canvas real clientWidth/Height (100×100) so
  // `computeScaleInfo` returns a non-null result.
  it('dispatches engineScaleChanged when the camera is ready and the viewport is non-degenerate', () => {
    const store = makeStore();
    const spy = vi.spyOn(store, 'dispatch');
    const state = makeCamState();
    const deps = makeCamDeps(state, store);

    runFrame(state, deps, 0);

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

  it('reports a km-scale legend under an ENGAGED body arm', () => {
    // The arm's world pose already ranges eye→ground; subtracting Earth's radius would drive the range
    // below zero, `computeScaleInfo` would return null and the reducer would hold the last label (the
    // bar froze the moment the arm engaged, 0.45 R ≈ 2,870 km up).
    const store = makeStore();
    const spy = vi.spyOn(store, 'dispatch');
    const state = makeCamState();
    const deps = makeCamDeps(state, store);

    const ALTITUDE_KM = 100;
    const arm = earthArm(1 + ALTITUDE_KM / EARTH_RADIUS_KM);
    store.dispatch(commitCameraPose(arm));
    // No focus row: nothing constrains a rung, so the arm holds at rest and
    // the legend — this fixture's whole subject — is read off it. A focus here
    // would owe an approach that flies the range straight out of the km band.
    state.cameraRuntime = {
      ...state.cameraRuntime,
      register: { ...state.cameraRuntime.register, pose: arm },
    };

    runFrame(state, deps, 0);

    const scaleCalls = spy.mock.calls.filter(
      (call) => (call[0] as { type?: string })?.type === engineScaleChanged.type,
    );
    expect(scaleCalls).not.toHaveLength(0);
    const { label } = (scaleCalls[0]![0] as ReturnType<typeof engineScaleChanged>).payload;
    const [, magnitude, unit] = label.match(/^([0-9.]+) (m|km)$/) ?? [];
    expect(unit).toBe('km');
    const km = Number(magnitude);
    expect(km).toBeGreaterThan(0);
    expect(km).toBeLessThan(EARTH_RADIUS_KM);
  });

  it('does not dispatch engineScaleChanged when the canvas has zero height (degenerate viewport)', () => {
    const store = makeStore();
    const spy = vi.spyOn(store, 'dispatch');
    const state = makeCamState();
    const deps: RunFrameDeps = {
      ...makeCamDeps(state, store),
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

  it('does not dispatch engineScaleChanged before boot', () => {
    const store = makeStore();
    const spy = vi.spyOn(store, 'dispatch');
    const state = makeState(); // not booted
    const deps = makeDeps(store);

    runFrame(state, deps, 0);

    const scaleCalls = spy.mock.calls.filter((call) => {
      const action = call[0] as { type?: string };
      return action?.type === engineScaleChanged.type;
    });
    expect(scaleCalls).toHaveLength(0);
  });
});

describe('runFrame — the label-director wake fold', () => {
  /** A fully READY fixture (every `isEngineReady` field non-null) so the body runs past the two label
   *  directors. Per-frame planners between the ready gate and the directors are left null so their
   *  blocks skip; `renderFrame`/`drawPickDebugOverlay` are mocked at module scope. */
  function makeReadyState(
    cosmoRunFrame: () => boolean,
    foregroundRunFrame: () => boolean,
  ): EngineState {
    const base = makeCamState();
    return {
      ...base,
      settings: {
        ...base.settings,
        flow: { enabled: false },
        bodies: { items: { sun: { enabled: false }, 's-star': { enabled: false } } },
      },
      slabRows: [],
      visibilityEntries: [],
      selectionRows: { focus: null },
      // Empty over the empty composition: runFrame's Layer-hook loop iterates this every ready frame.
      layers: [],
      cubemapCaptures: makeCubemapCaptureRuntimes(),
      gpu: {
        ...base.gpu,
        galaxyPointRenderer: {},
        galaxyPickRenderer: {},
        renderTargets: { reconcile: vi.fn() },
        compositor: {},
        starCatalogRenderer: null,
        label3DRenderer: { setLabels: vi.fn() },
      },
      subsystems: {
        ...base.subsystems,
        texturedDisks: { hasInFlightWork: () => false },
        proceduralDisks: null,
        diskPlannerWalk: null,
        hiResFamous: null,
        surfaceTiles: null,
        structureFocus: createStructureFocusSubsystem({ requestRender: vi.fn() }),
        fades: { tick: vi.fn(), opacityOf: () => 0, isAnyAnimating: () => false },
        cosmoLabelDirector: { runFrame: vi.fn(cosmoRunFrame) },
        foregroundLabelDirector: { runFrame: vi.fn(foregroundRunFrame) },
      },
    } as unknown as EngineState;
  }

  it("a director voting true does not prevent its siblings' flush", () => {
    // spec §12's short-circuit trap: `a() || b() || c()` would never call
    // `b()`/`c()` once `a()` returns true, silently dropping a later
    // statement's GPU flush the moment an earlier one votes to keep
    // animating. `runLabel3DProducers` is the newest of the three and the
    // one most likely to get folded into the `||` chain later — pin it too.
    const state = makeReadyState(
      () => true, // COSMO votes true — must NOT short-circuit the calls below
      () => false,
    );
    const deps = makeCamDeps(state);

    runFrame(state, deps, 0);

    expect(state.subsystems.cosmoLabelDirector.runFrame).toHaveBeenCalledTimes(1);
    expect(state.subsystems.foregroundLabelDirector.runFrame).toHaveBeenCalledTimes(1);
    expect(state.gpu.label3DRenderer!.setLabels).toHaveBeenCalledTimes(1);
  });

  it('the outgoing focused structure keeps full emphasis through the fade-out', () => {
    const VIRGO_WORD = 42;
    const base = makeReadyState(
      () => false,
      () => false,
    );
    const structureFocus = createStructureFocusSubsystem({ requestRender: vi.fn() }, 0);
    const state = {
      ...base,
      selectionKindRows: [
        {
          type: 'structure',
          encodePick: (ref: { id: string }) => (ref.id === 'virgo' ? VIRGO_WORD : null),
        },
      ],
      subsystems: {
        ...base.subsystems,
        scheduler: { requestRender: vi.fn(), requestIdleFrame: vi.fn() },
        structureFocus,
      },
    } as unknown as EngineState;
    // Virgo was focused and settled; the focus is already cleared (the fixture's
    // focus row is null), so the frames below tick its fade-out.
    structureFocus.update({ id: 'virgo', worldPos: [1, 0, 0], physicalRadiusMpc: 2 } as never, 0);
    structureFocus.produceFocusUniforms(500);
    const deps = makeCamDeps(state);
    const snapshotAt = (nowMs: number) => {
      runFrame(state, deps, nowMs);
      return vi.mocked(state.subsystems.cosmoLabelDirector.runFrame).mock.lastCall![1].snapshot;
    };

    snapshotAt(600);
    const fading = snapshotAt(800);
    expect(fading.focusBlend).toBeGreaterThan(0);
    expect(fading.focusPickId).toBe(VIRGO_WORD);
    const settled = snapshotAt(1100);
    expect(settled.focusBlend).toBe(0);
    expect(settled.focusPickId).toBeNull();
  });
});

describe('runFrame — the planner keep-ticking fold', () => {
  /** A fully READY fixture. `renderFrame` is mocked at module scope; a test needing a planner vote
   *  mutates `input.canvas.snapshot.plans` from inside that mock, as the real `renderFrame` would via
   *  `runPlanSteps`; `runFrame` only folds the result (`snapshot.plans.awake`). */
  function makeReadyState(): EngineState {
    const base = makeCamState();
    return {
      ...base,
      settings: {
        ...base.settings,
        flow: { enabled: false },
        bodies: { items: { sun: { enabled: false }, 's-star': { enabled: false } } },
      },
      slabRows: [],
      visibilityEntries: [],
      selectionRows: { focus: null },
      layers: [],
      cubemapCaptures: makeCubemapCaptureRuntimes(),
      gpu: {
        ...base.gpu,
        galaxyPointRenderer: {},
        galaxyPickRenderer: {},
        renderTargets: { reconcile: vi.fn() },
        compositor: {},
        starCatalogRenderer: null,
        label3DRenderer: { setLabels: vi.fn() },
      },
      subsystems: {
        ...base.subsystems,
        // At rest, keepTicking is false and the still-live sim clock falls
        // through to the idle-tick arm.
        scheduler: { requestRender: vi.fn(), requestIdleFrame: vi.fn() },
        texturedDisks: { hasInFlightWork: () => false },
        proceduralDisks: null,
        diskPlannerWalk: null,
        hiResFamous: null,
        surfaceTiles: null,
        structureFocus: {
          update: vi.fn(),
          produceFocusUniforms: vi.fn(() => ({
            center: [1, 2, 3],
            apparentRadiusMpc: 1,
            physicalRadiusMpc: 1,
            blend: 0.5,
          })),
          lastFocusRef: () => null,
          isAwake: () => false,
        },
        fades: { tick: vi.fn(), opacityOf: () => 0, isAnyAnimating: () => false },
        cosmoLabelDirector: { runFrame: () => false },
        foregroundLabelDirector: { runFrame: () => false },
      },
    } as unknown as EngineState;
  }

  it('a frame otherwise at rest, with no planner voting awake, does not keep the loop ticking', () => {
    const state = makeReadyState();
    runFrame(state, makeCamDeps(state), 0);
    expect(state.subsystems.scheduler.requestRender).not.toHaveBeenCalled();
  });

  it('keeps the loop ticking off `snapshot.plans.awake`, read AFTER renderFrame ran', () => {
    const state = makeReadyState();
    const wakingPlanner: FrameContentPlanner<void> = {
      name: 'test-awake',
      scope: 'once',
      plan: () => ({ value: undefined, awake: true, settling: false }),
    };
    vi.mocked(renderFrame).mockImplementationOnce((input) => {
      input.canvas.snapshot.plans.put(wakingPlanner, undefined, {
        value: undefined,
        awake: true,
        settling: false,
      });
    });

    runFrame(state, makeCamDeps(state), 0);

    expect(state.subsystems.scheduler.requestRender).toHaveBeenCalled();
  });

  it('writes the frame tile plan, applies it, and keeps ticking while tiles are in flight', () => {
    // Bug caught: the plan's wake vote never reaching the keep-ticking
    // predicate. A landing tile wakes the loop itself; a landing manifest does
    // not, so only this vote carries the loop through its fetch.
    const state = makeReadyState();
    const apply = vi.fn();
    const residency = {
      manifest: () => ({ status: 'absent', value: null }),
      residentSlot: () => null,
      isInFlight: () => false,
      hasFailed: () => false,
      inFlightCount: () => 1,
      engagedBodyId: () => null,
    };
    state.subsystems.surfaceTiles = {
      stream: { residency, apply },
      plan: IDLE_SURFACE_TILE_PLAN,
    } as unknown as EngineState['subsystems']['surfaceTiles'];

    runFrame(state, makeCamDeps(state), 0);

    const written = state.subsystems.surfaceTiles!.plan;
    expect(written.awake).toBe(true);
    expect(apply).toHaveBeenCalledWith(written);
    expect(state.subsystems.scheduler.requestRender).toHaveBeenCalled();
  });
});

describe('runFrame — effective intent', () => {
  it('the driver table sees a commit the same frame the drain made it', () => {
    // An at-rest notch commits its base and the resting driver renders `base`:
    // the driver must read the frame's OWN commits (folded through the
    // reducer), not the snapshot taken before they were dispatched, or the
    // notch shows a frame late.
    const h = makeCameraSimHarness({ focusBody: null, bootHR: null, canvasSize: 1000 });
    h.seedPose(absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 }));

    h.notch(100, [500, 500]);
    h.frame();

    const committed = worldArmOf(h.store.getState().camera.base).distance;
    expect(committed).toBeGreaterThan(100);
    expect(worldArmOf(h.state.cameraRuntime.register.pose).distance).toBe(committed);
  });

  it('a frame with no input reuses the store snapshot by identity', () => {
    // The reducer fold must not allocate on steady frames — `toBe`, so a
    // memoised selector keyed on the root object keeps its cache.
    const h = makeCameraSimHarness({ focusBody: null });
    let seen: RootState | null = null;
    const probe: CameraDriver = {
      id: 'probe' as DriverId,
      priority: 1000,
      isActive: () => true,
      pose: (ctx, mem) => {
        seen = ctx.state;
        return { pose: ctx.register, memory: mem };
      },
    };
    const drivers = [probe, ...CAMERA_DRIVERS];
    const deps = { ...h.deps, controlSchemes: { skymap: { drivers }, openspace: { drivers } } };

    const before = h.store.getState();
    runFrame(h.state, deps, 16);

    expect(seen).toBe(before);
  });

  it('the frame’s actions reach the store in the same order as before', () => {
    // The `drag end` frame of the driver golden trace, reproduced: the
    // replay's commit and `endDrag` dispatch first and in order, the scale
    // dispatch after them. Recorded the way the fixture records.
    const h = makeCameraSimHarness({ focusBody: null, bootHR: 5 });
    h.frame(4);
    h.press('orbit', [50, 50]);
    h.moveTo([56, 50]);
    h.frame();
    h.release();

    const recorded: string[] = [];
    const inner = h.store.dispatch.bind(h.store);
    h.store.dispatch = ((action: { type: string }) => {
      if (action.type !== inputConsumed.type) recorded.push(action.type);
      return inner(action as never);
    }) as typeof h.store.dispatch;
    h.frame();

    const want = GOLDEN.find((step) => step.label === 'drag end')!.actions;
    expect(want).toContain('camera/endDrag');
    expect(recorded).toEqual(want);
  });

  it('commits the tail of a gesture that ended mid-frame', () => {
    // The commit fires on the frame after pointerup, so the moves that
    // preceded the release must land BEFORE it or the store bakes a pose one
    // frame stale — and the drag flag clears in the same frame.
    const h = makeCameraSimHarness({ focusBody: null, bootHR: null, canvasSize: 1000 });
    h.seedPose(absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 }));
    h.press('orbit', [100, 100]);
    h.moveTo([150, 100]);
    h.release();

    h.frame();

    expect(worldArmOf(h.store.getState().camera.base).yaw).toBeCloseTo(-50 * 0.005, 6);
    expect(h.store.getState().camera.dragging).toBe(false);
  });
});

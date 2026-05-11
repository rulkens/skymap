/**
 * wireInput — focused test for the highest-leverage invariant of the
 * third bootstrap phase: the initial camera framing call.
 *
 * ### Why this file exists
 *
 * Pre-M7 the only coverage `wireInput.ts` had was `bootstrap.test.ts`,
 * which mocks the phase at module scope.  That left ~400 lines of
 * camera, pick-renderer, click-handler, and settings-seed wiring with
 * zero direct asserts.
 *
 * The single highest-leverage invariant — and the one that most
 * clearly maps to a user-visible failure — is the *initial camera
 * framing*: if wireInput stops computing the camera frame from the
 * loaded clouds' bbox, the user lands on a black screen or a
 * pathologically zoomed view on first paint.  This was a real
 * symptom of the 2026-05-08 black-screen incident.
 *
 * ### What this test asserts
 *
 * `computeInitialCamera` is called with the bbox computed from
 * `state.sources.clouds` and a vertical FOV in radians.  The bbox
 * derivation is `max(|maxAbsCoord(cloud)|)` across every loaded
 * cloud — by populating `state.sources.clouds` with a single
 * synthetic cloud whose absolute coordinate is known, we can
 * predict the bbox exactly and assert against it.
 *
 * ### Why mock `computeInitialCamera`
 *
 * The function is pure and itself tested elsewhere
 * (`tests/services/engine/cameraFraming.test.ts`).  Here we only
 * care that wireInput *calls it with the right inputs* — that's the
 * load-bearing contract between the phase and the framing helper.
 * Mocking lets us assert call args without re-deriving the framing
 * math in the test.
 *
 * ### Why mock the rest
 *
 * Every other call in wireInput (`createPickRenderer`,
 * `attachOrbitControls`, `attachEngineInputs`, `createOrbitCamera`,
 * `createClickResolver`, `seedSettingsCallbacks`) touches a real GPU
 * device, real DOM listeners, or a sibling subsystem with its own
 * dependencies.  Stubbing each one keeps wireInput's body running to
 * completion without dragging in WebGPU or jsdom event surface.
 */

import { describe, it, expect, vi } from 'vitest';
import { Source } from '../../../../src/data/sources';
import type { EngineCallbacks, EngineState } from '../../../../src/@types';
import type { BootstrapDeps } from '../../../../src/services/engine/phases/bootstrap';

// ── Module mocks ──────────────────────────────────────────────────────

// The framing helper — the load-bearing assertion target.  Returns a
// shape that satisfies `createOrbitCamera`'s `init` arg.
const computeInitialCameraSpy = vi.fn(() => ({
  target: [0, 0, 0] as [number, number, number],
  distance: 644.72,
  yaw: 0,
  pitch: 0.3,
  fovYRad: Math.PI / 3,
  near: 0.01,
  far: 4000,
}));
vi.mock('../../../../src/services/engine/camera/cameraFraming', () => ({
  computeInitialCamera: (...args: unknown[]) =>
    computeInitialCameraSpy(...(args as Parameters<typeof computeInitialCameraSpy>)),
}));

// The maxAbsCoord helper — pure, but it pulls in pointInfoBuilder which
// imports cloud-related types.  We stub it so we can drive the bbox
// expectation deterministically from the test.
vi.mock('../../../../src/services/engine/helpers/pointInfoBuilder', () => ({
  maxAbsCoord: vi.fn((cloud: { _maxAbs: number }) => cloud._maxAbs),
  buildPointInfo: vi.fn(),
}));

// Camera / input / pick — stub factories that return inert objects.
vi.mock('../../../../src/services/camera/orbitCamera', () => ({
  createOrbitCamera: vi.fn(() => ({
    target: [0, 0, 0],
    distance: 644.72,
    yaw: 0,
    pitch: 0.3,
    fovYRad: Math.PI / 3,
    aspect: 1,
    near: 0.01,
    far: 4000,
  })),
}));

vi.mock('../../../../src/services/camera/orbitControls', () => ({
  attachOrbitControls: vi.fn(() => () => {}),
}));

vi.mock('../../../../src/services/gpu/renderers/pickRenderer', () => ({
  createPickRenderer: vi.fn(() => ({ destroy: vi.fn() })),
}));

vi.mock('../../../../src/services/engine/interaction/clickHandler', () => ({
  createClickResolver: vi.fn(() => ({ resolveClick: vi.fn() })),
}));

vi.mock('../../../../src/services/engine/interaction/inputBindings', () => ({
  attachEngineInputs: vi.fn(() => ({ detach: vi.fn() })),
}));

vi.mock('../../../../src/services/engine/wiring/seedSettingsCallbacks', () => ({
  seedSettingsCallbacks: vi.fn(),
}));

// Imported AFTER the mocks so wireInput picks them up.
import { wireInput } from '../../../../src/services/engine/phases/wireInput';

// ── Fixtures ─────────────────────────────────────────────────────────

/**
 * Minimal `EngineState` shaped for wireInput's body.  Sets up:
 *   - one fake cloud in `state.sources.clouds` (so the bbox loop has
 *     something to iterate);
 *   - a stub `gpu.renderer` whose `totalCount()` is read for the
 *     `kind: 'ready'` status payload;
 *   - the subsystem bag wireInput writes to (`clickResolver`,
 *     `inputBindings`) and reads from (`scheduler`, `selection`,
 *     `tweens`).
 */
function makeState(maxAbs: number): EngineState {
  const cloud = { _maxAbs: maxAbs, count: 1 };
  const clouds = new Map<Source, typeof cloud>();
  clouds.set(Source.SDSS, cloud);
  return {
    settings: {
      points: {
        sizePx: 2.5,
        brightness: 1.0,
        depthFade: true,
        highlightFallback: true,
        realOnly: false,
      },
      tonemap: { exposure: 1.0, curve: 'reinhard' },
      camera: { autoRotate: false },
      bias: { mode: 'off', absMagLimit: -18 },
      thumbnails: { enabled: true },
      milkyWay: { enabled: true },
      filaments: { enabled: false, intensity: 1.0 },
      volumes: { masterEnabled: true, fields: {} },
    },
    bias: {} as never,
    sources: {
      clouds,
      visibleMask: 0xff,
      lodMode: 'auto',
      famousMeta: [],
      famousXrefs: {},
      tier: 'medium',
    },
    picking: { latestMouseCss: null, pointerDown: false } as never,
    gpu: {
      renderer: {
        totalCount: () => 1,
        loadedSources: () => [],
      } as never,
      pickRenderer: null,
      postProcess: null,
      filamentRenderer: null,
      labelRenderer: null,
      markerLineRenderer: null,
      thumbnailRenderer: null,
      diskRenderer: null,
      proceduralDiskRenderer: null,
      milkyWayRenderer: null,
      scalarVolumeRenderer: null,
    },
    subsystems: {
      scheduler: { requestRender: vi.fn() },
      selection: { setHovered: vi.fn(), setSelected: vi.fn() },
      tweens: { cancel: vi.fn() },
      clickResolver: null,
      inputBindings: null,
    } as never,
    cam: null,
    initialCamSnapshot: null,
    assetSlots: {
      points: new Map(),
      filaments: null,
      famousMeta: null,
      pgcAlias: null,
      cf4Density: null,
    },
  } as unknown as EngineState;
}

function makeDeps(firstReadySource: Source | null): BootstrapDeps {
  const cb: EngineCallbacks = {
    lifecycle: { onStatusChange: vi.fn() },
    selection: { onSelectionChange: vi.fn() } as never,
  } as unknown as EngineCallbacks;
  return {
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
    cb,
    frameRef: { current: () => {} },
    detachControlsRef: { current: null },
    handleRef: { current: null },
    allSlots: new Map(),
    fpsCounter: { sample: () => null } as unknown as BootstrapDeps['fpsCounter'],
    lastReportedFps: { current: null },
    phaseLocals: {
      device: {} as GPUDevice,
      context: {} as GPUCanvasContext,
      thumbnailRenderer: {} as never,
      diskRenderer: {} as never,
      proceduralDiskRenderer: {} as never,
      milkyWayRenderer: {} as never,
      // The framing flow reads this to populate the `kind: 'ready'`
      // status payload's `source` field — see wireInput.ts's
      // `cloudSourceFor(firstReadySource ?? Source.Synthetic)` call.
      // The test sets it to SDSS to mirror the wireSlots-resolved
      // outcome.
      firstReadySource,
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('wireInput', () => {
  it('initial camera framing fires with the bbox derived from state.sources.clouds and a 60° FOV', async () => {
    // The bbox loop iterates `state.sources.clouds.values()` and
    // tracks the max `maxAbsCoord(cloud)`.  Our fake cloud reports
    // `_maxAbs = 1500` (typical GLADE-scale Mpc value); the framing
    // helper should receive exactly that bbox plus the canonical
    // 60° vertical FOV in radians.
    const state = makeState(1500);
    const deps = makeDeps(Source.SDSS);

    await wireInput(state, deps);

    expect(computeInitialCameraSpy).toHaveBeenCalledTimes(1);
    expect(computeInitialCameraSpy).toHaveBeenCalledWith({
      bbox: 1500,
      fovYRad: (Math.PI / 180) * 60,
    });

    // The camera framing call having happened is the load-bearing
    // assertion, but we also expect `state.cam` to be populated
    // afterwards — the visible side-effect that drives the rest of
    // the engine (camera matrices, frame loop, orbit controls
    // attach).  Without this side-effect, a future refactor that
    // accidentally drops the assignment would leave `state.cam = null`
    // and break the first frame.
    expect(state.cam).not.toBeNull();

    // And `state.initialCamSnapshot` was captured for resetCamera() —
    // wireInput's docblock calls this out as load-bearing because
    // the snapshot's `target` array MUST be a cloned tuple (the bug
    // wireInput.ts's inline comment describes).  Asserting it exists
    // pins the contract; the clone correctness itself is implicit in
    // the framing helper's mock returning a fresh array each call.
    expect(state.initialCamSnapshot).not.toBeNull();
  });
});

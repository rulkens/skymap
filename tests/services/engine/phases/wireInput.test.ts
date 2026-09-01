/**
 * wireInput — focused test for the highest-leverage invariant of the
 * third bootstrap phase: the initial camera framing call.
 *
 * `computeInitialCamera` is called with a 60° FOV and the result drives
 * `state.cam`. No bbox input — framing uses pure constants so the phase
 * can run before any galaxy catalog arrives.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../../../src/store/rootReducer';
import { createCameraClock } from '../../../../src/services/engine/camera/cameraClock';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_GALAXY_PROVENANCE } from '../../../../src/data/defaults';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';

// ── Module mocks ──────────────────────────────────────────────────────

const computeInitialCameraSpy = vi.fn(() => ({
  target: [0, 0, 0] as [number, number, number],
  distance: 0.43,
  yaw: 3.0045,
  pitch: 0.0609,
  fovYRad: Math.PI / 3,
  near: 0.01,
  far: 6000,
}));
vi.mock('../../../../src/services/engine/camera/cameraFraming', () => ({
  computeInitialCamera: (...args: unknown[]) =>
    computeInitialCameraSpy(...(args as Parameters<typeof computeInitialCameraSpy>)),
  DEFAULT_FOV_Y_RAD: (Math.PI / 180) * 60,
}));

vi.mock('../../../../src/services/engine/helpers/buildGalaxyInfo', () => ({
  buildGalaxyInfo: vi.fn(),
}));

vi.mock('../../../../src/utils/camera/createOrbitCamera', () => ({
  createOrbitCamera: vi.fn(() => ({
    target: [0, 0, 0],
    distance: 0.43,
    yaw: 3.0045,
    pitch: 0.0609,
    fovYRad: Math.PI / 3,
    aspect: 1,
    near: 0.01,
    far: 6000,
  })),
}));

const attachOrbitControlsSpy = vi.fn((..._args: unknown[]) => () => {});
vi.mock('../../../../src/services/camera/orbitControls', () => ({
  attachOrbitControls: (...args: unknown[]) => attachOrbitControlsSpy(...args),
}));

vi.mock('../../../../src/services/gpu/renderers/galaxyCatalog/galaxyPickRenderer', () => ({
  createGalaxyPickRenderer: vi.fn(() => ({ destroy: vi.fn() })),
}));

// The content-layer registry pulls in every layer module (heavy GPU deps);
// wireInput only needs the array to hand to createPickProgram, so an empty
// stub is enough and keeps the phase test free of the full renderer graph.
vi.mock('../../../../src/services/engine/frame/passes', () => ({
  CONTENT_LAYERS: [],
}));

vi.mock('../../../../src/services/engine/frame/pickProgram', () => ({
  createPickProgram: vi.fn(() => ({
    label: 'pickProgram',
    pick: vi.fn(async () => null),
    renderForDebug: vi.fn(() => null),
    destroy: vi.fn(),
  })),
}));

vi.mock('../../../../src/services/engine/interaction/clickHandler', () => ({
  createClickResolver: vi.fn(() => ({ resolveClick: vi.fn() })),
}));

vi.mock('../../../../src/services/engine/interaction/inputBindings', () => ({
  attachEngineInputs: vi.fn(() => ({ detach: vi.fn() })),
}));

// Imported AFTER the mocks so wireInput picks them up.
import { wireInput } from '../../../../src/services/engine/phases/wireInput';
// The registry itself: derives the wireInput-phase key set for the
// phase-split assertion below, rather than a hand-written key list that
// could drift from GPU_HANDLE_ROWS.
import { GPU_HANDLE_ROWS } from '../../../../src/services/engine/gpuHandles/gpuHandleRegistry';
import {
  selectSelectedRef,
  selectFocusRef,
  selectPendingFocusId,
} from '../../../../src/state/selection/selectors';
import {
  updateSelectionSelect,
  updateSelectionFocus,
} from '../../../../src/state/selection/selectionSlice';
import { requestFocus } from '../../../../src/state/selection/requestFocus';
import { EARTH_REF } from '../../../../src/data/selection/earthRef';

// ── Fixtures ─────────────────────────────────────────────────────────

function makeState(): EngineState {
  return {
    settings: {
      galaxyCatalogs: {
        enabled: true,
        sizePx: 2.5,
        brightness: 1.0,
        depthFade: true,
        provenance: DEFAULT_GALAXY_PROVENANCE,
        items: {
          famousGalaxy: { enabled: true, labelEnabled: true },
        },
      },
      tonemap: { exposure: 1.0, curve: 'reinhard' },
      bias: { mode: 'off', absMagLimit: -18 },
      thumbnails: { enabled: true },
      milkyWay: { enabled: true },
      filaments: { enabled: false, intensity: 1.0 },
      volumes: { enabled: true },
      structures: {
        enabled: true,
        items: {
          cluster: { enabled: true, labelEnabled: true },
          supercluster: { enabled: true, labelEnabled: true },
          void: { enabled: true, labelEnabled: true },
          group: { enabled: true, labelEnabled: true },
        },
      },
      debug: {
        overlays: { 'pick-buffer': false, 'disk-radius-ring': false },
        disabledPasses: {},
        renderStrategy: 'auto',
      },
    },
    bias: {} as never,
    picking: { pointerDown: false } as never,
    // createClickResolver captures the store accessors for resolvePick;
    // createClickResolver is module-mocked here, so the accessors are
    // never invoked — an empty galaxies/structures stub is enough.
    data: {
      structures: { byCategory: () => [] },
      galaxies: { get: () => undefined, famousGalaxiesMeta: [] },
    } as never,
    gpu: {
      galaxyPointRenderer: {
        totalCount: () => 0,
        loadedSources: () => [],
      } as never,
      galaxyPickRenderer: null,
      pickProgram: null,
      // createGalaxyPickRenderer binds the shared focus group; the stub only
      // needs an opaque bindGroup handle.
      focusUniform: { bindGroup: {} as GPUBindGroup },
      renderTargets: null,
      filamentRenderer: null,
      labelRenderer: null,
      markerLineRenderer: null,
      texturedQuadRenderer: null,
      texturedDiskRenderer: null,
      proceduralDiskRenderer: null,
      volumeFieldRenderer: null,
      volumeUpsample: null,
    },
    subsystems: {
      scheduler: { requestRender: vi.fn() },
      selection: { setHovered: vi.fn(), setSelected: vi.fn() },
      clickResolver: null,
      inputBindings: null,
    } as never,
    cam: null,
    cameraRuntime: {
      clock: createCameraClock(),
      projection: { fovYRad: 0, aspect: 1, near: 0.01, far: 50000 },
      lastPose: { current: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 } },
      prevActiveId: { current: 'resting' },
    },
    assetSlots: {
      points: new Map(),
      filaments: null,
      famousGalaxiesMeta: null,
      pgcAlias: null,
      cf4Density: null,
    },
  } as unknown as EngineState;
}

function makeDeps(): BootstrapDeps {
  const cb: EngineCallbacks = {
    store: configureStore({ reducer: rootReducer }),
  } as unknown as EngineCallbacks;
  return {
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
    cb,
    frameRef: { current: () => {} },
    detachControlsRef: { current: null },
    handleRef: { current: null },
    allSlots: new Map(),
    phaseLocals: {
      device: {} as GPUDevice,
      context: {} as GPUCanvasContext,
      unwatchHdrCapability: () => {},
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('wireInput', () => {
  it('frames the boot camera at the canonical 60° FOV and the live sim instant', async () => {
    const state = makeState();
    const deps = makeDeps();

    await wireInput(state, deps);

    expect(computeInitialCameraSpy).toHaveBeenCalledTimes(1);
    // The boot store defaults to the ecliptic orientation, so the phase threads
    // that committed basis into the framing call (first-paint encodes through the
    // frame the render path decodes with).
    expect(computeInitialCameraSpy).toHaveBeenCalledWith({
      fovYRad: (Math.PI / 180) * 60,
      simDays: expect.any(Number),
      frameBasis: ORIENTATION_FRAMES.ecliptic,
    });
    expect(state.cam).not.toBeNull();
  });

  it('seeds the home selection: select + focus pinned to Earth at boot', async () => {
    const state = makeState();
    const deps = makeDeps();

    await wireInput(state, deps);

    // Boot IS the home state — both slots must point at Earth so the follow
    // driver tracks the live globe and the InfoCard pins on first paint.
    const root = deps.cb.store.getState();
    expect(selectSelectedRef(root)).toEqual(EARTH_REF);
    expect(selectFocusRef(root)).toEqual(EARTH_REF);
  });

  it('leaves an existing selection alone — a URL-hash focus restored before bootstrap wins', async () => {
    const state = makeState();
    const deps = makeDeps();

    // A `#focus=body-jupiter` deep link resolves at React mount (bodies are a
    // static registry — no catalog wait), which is BEFORE this async bootstrap
    // phase runs. The Earth seed must not clobber it.
    const jupiter = { type: 'body', id: 'jupiter' } as const;
    deps.cb.store.dispatch(updateSelectionSelect(jupiter));
    deps.cb.store.dispatch(updateSelectionFocus(jupiter));

    await wireInput(state, deps);

    const root = deps.cb.store.getState();
    expect(selectSelectedRef(root)).toEqual(jupiter);
    expect(selectFocusRef(root)).toEqual(jupiter);
  });

  it('defers the seed to a galaxy/star id still parked in a deferred resolve', async () => {
    const state = makeState();
    const deps = makeDeps();

    // A galaxy/star focus id defers until its catalog pulse lands
    // (`resolveFocusRefDeferring` parks it), so the resolved `focus` ref
    // stays null for the whole boot window while `pending.focus` already
    // holds the id — the extraReducer sets `pending.focus` synchronously,
    // no saga needed to observe the guard here. A ref-only guard would read
    // this as "empty" and seed Earth over the still-resolving deep link.
    deps.cb.store.dispatch(requestFocus('m31'));

    await wireInput(state, deps);

    const root = deps.cb.store.getState();
    expect(selectSelectedRef(root)).toBeNull();
    expect(selectFocusRef(root)).toBeNull();
    expect(selectPendingFocusId(root)).toBe('m31');
  });

  it('constructs the wireInput-phase GPU_HANDLE_ROWS rows', async () => {
    // The complement of initGpu's phase-split assertion: emptying or
    // narrowing wireInput's row filter must fail here.
    const state = makeState();
    const deps = makeDeps();

    await wireInput(state, deps);

    const gpu = state.gpu as unknown as Record<string, unknown>;
    for (const row of GPU_HANDLE_ROWS) {
      if ('constructPhase' in row) {
        expect(gpu[row.key]).toBeTruthy();
      }
    }
  });
});

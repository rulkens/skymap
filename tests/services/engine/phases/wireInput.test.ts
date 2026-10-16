/**
 * wireInput — focused test for the highest-leverage invariant of the
 * third bootstrap phase: the initial camera framing call.
 *
 * `homePose` is called with a 60° FOV and the result drives the boot pose
 * seed. No bbox input — framing uses pure constants so the phase can run
 * before any galaxy catalog arrives.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../../../src/store/rootReducer';
import { UNSTARTED_EPOCHS } from '../../../../src/services/engine/camera/cameraEpochs';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_GALAXY_PROVENANCE } from '../../../../src/layers/galaxyCatalog/state/defaults';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';
import { EARTH_HOME } from '../../../../src/data/selection/earthHome';

// ── Module mocks ──────────────────────────────────────────────────────

const homePoseSpy = vi.fn(() => ({
  frame: 'absolute' as const,
  pose: {
    target: [0, 0, 0] as [number, number, number],
    distance: 0.43,
    yaw: 3.0045,
    pitch: 0.0609,
  },
}));
vi.mock('../../../../src/services/engine/camera/homePose', () => ({
  homePose: (...args: unknown[]) => homePoseSpy(...(args as Parameters<typeof homePoseSpy>)),
}));

vi.mock('../../../../src/services/engine/helpers/buildGalaxyInfo', () => ({
  buildGalaxyInfo: vi.fn(),
}));

vi.mock('../../../../src/layers/galaxyCatalog/render/galaxyPickRenderer', () => ({
  createGalaxyPickRenderer: vi.fn(() => ({ destroy: vi.fn() })),
}));

// The content-layer registry pulls in every layer module (heavy GPU deps);
// wireInput only needs the array to hand to createPickProgram, so an empty
// stub is enough and keeps the phase test free of the full renderer graph.
vi.mock('../../../../src/services/engine/frame/passes', () => ({
  CONTENT_PASSES: [],
}));

vi.mock('../../../../src/services/engine/frame/pickProgram', () => ({
  createPickProgram: vi.fn(() => ({
    label: 'pickProgram',
    pick: vi.fn(async () => null),
    renderForDebug: vi.fn(() => null),
    destroy: vi.fn(),
  })),
}));

vi.mock('../../../../src/services/engine/interaction/createPickDriver', () => ({
  createPickDriver: vi.fn(() => ({ destroy: vi.fn() })),
}));

vi.mock('../../../../src/services/engine/interaction/attachResizeWake', () => ({
  attachResizeWake: vi.fn(() => ({ detach: vi.fn() })),
}));

// Imported AFTER the mocks so wireInput picks them up.
import { wireInput } from '../../../../src/services/engine/phases/wireInput';
// The registry itself: derives the wireInput-phase key set for the
// phase-split assertion below, rather than a hand-written key list that
// could drift from GPU_HANDLE_ROWS.
import { GPU_HANDLE_ROWS } from '../../../../src/services/engine/gpuHandles/gpuHandleRegistry';
import { selectSelectedRef, selectFocusRef } from '../../../../src/state/selection/selectors';

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
      cosmicWebFilaments: { enabled: false, intensity: 1.0 },
      cosmicWebDensity: { enabled: true },
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
        overlays: { 'pick-buffer': false },
        disabledPasses: {},
        renderStrategy: 'auto',
      },
    },
    bias: {} as never,
    picking: { pickInFlight: false, cursorTexPx: null },
    // createPickDriver is module-mocked here, so resolvePick's accessors are
    // never invoked — an empty galaxies/structures stub is enough.
    data: {
      structures: { byCategory: () => [] },
      galaxies: { get: () => undefined, famousMeta: [] },
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
      labelRendererCosmo: null,
      markerLineRendererCosmo: null,
      texturedQuadRenderer: null,
      texturedDiskRenderer: null,
      proceduralDiskRenderer: null,
    },
    subsystems: {
      scheduler: { requestRender: vi.fn() },
      selection: { setHovered: vi.fn(), setSelected: vi.fn() },
      pickDriver: null,
      resizeWake: null,
    } as never,
    booted: false,
    cameraRuntime: {
      register: { pose: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 }, winner: 'resting' },
      epochs: UNSTARTED_EPOCHS,
      follow: null,
      outputs: {
        displayed: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 },
        projection: { fovYRad: 0, aspect: 1, near: 0.01, far: 50000 },
      },
    },
    assetSlots: {
      points: new Map(),
      filaments: null,
      famousGalaxiesMeta: null,
      pgcAlias: null,
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
    composition: { layers: [], home: EARTH_HOME },
    frameRef: { current: () => {} },
    handleRef: { current: null },
    allSlots: new Map(),
    // `createPickDriver` is module-mocked above, so no test here exercises
    // a resolution — a resolver that always returns null is enough.
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

// ── Tests ────────────────────────────────────────────────────────────

describe('wireInput', () => {
  it('frames the boot camera at the canonical 60° FOV and the live sim instant', async () => {
    const state = makeState();
    const deps = makeDeps();

    await wireInput(state, deps);

    expect(homePoseSpy).toHaveBeenCalledTimes(1);
    // The boot store defaults to the ecliptic orientation, so the phase threads
    // that committed basis into the framing call (first-paint encodes through the
    // frame the render path decodes with).
    expect(homePoseSpy).toHaveBeenCalledWith(
      deps.composition.home,
      (Math.PI / 180) * 60,
      expect.any(Number),
      ORIENTATION_FRAMES.ecliptic,
    );
    expect(state.booted).toBe(true);
  });

  it('seeds the runtime off the PRE-commit store, so frame one reads the boot commit as outside', async () => {
    const state = makeState();
    const deps = makeDeps();

    await wireInput(state, deps);

    // B2: `stepCameraRuntime`'s `external` check is `prev.base !== store.base`
    // by reference — true here because the seed ran before the commit below
    // it, off the still-placeholder store, so the boot pose lands settled
    // rather than through an eased follow approach.
    expect(state.cameraRuntime.base).not.toBe(deps.cb.store.getState().camera.base);
  });

  it('seeds no selection: the first view is the arrival’s', async () => {
    const state = makeState();
    const deps = makeDeps();

    await wireInput(state, deps);

    const root = deps.cb.store.getState();
    expect(selectSelectedRef(root)).toBeNull();
    expect(selectFocusRef(root)).toBeNull();
  });

  it('frames the neutral pose for a composition with no home target', async () => {
    const state = makeState();
    const deps = {
      ...makeDeps(),
      composition: { layers: [], home: { ...EARTH_HOME, focus: null } },
    };

    await wireInput(state, deps);

    expect(homePoseSpy).toHaveBeenCalledWith(
      expect.objectContaining({ focus: null }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('wires the camera and the resize binding when the pick renderers are absent', async () => {
    // No renderer must never mean no input and no error.
    const state = makeState();
    const deps = makeDeps();

    await wireInput(state, deps);

    expect(state.booted).toBe(true);
    expect(state.subsystems.resizeWake).not.toBeNull();
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

/**
 * wireInput — focused test for the highest-leverage invariant of the
 * third bootstrap phase: the initial camera framing call.
 *
 * `computeInitialCamera` is called with a 60° FOV and the result drives
 * `state.cam` + `state.initialCamSnapshot`. No bbox input — framing
 * uses pure constants so the phase can run before any galaxy catalog arrives.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../../../src/store/rootReducer';
import { createCameraClock } from '../../../../src/services/engine/camera/cameraClock';
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

// Imported AFTER the mocks so wireInput picks them up.
import { wireInput } from '../../../../src/services/engine/phases/wireInput';

// ── Fixtures ─────────────────────────────────────────────────────────

function makeState(): EngineState {
  return {
    settings: {
      galaxyCatalogs: {
        enabled: true,
        sizePx: 2.5,
        brightness: 1.0,
        depthFade: true,
        highlightFallback: true,
        realOnly: false,
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
        showPickBuffer: false,
        showDiskRadiusRing: false,
        disabledPasses: {},
      },
    },
    bias: {} as never,
    picking: { pointerDown: false } as never,
    // createClickResolver captures the store accessors for resolvePick;
    // createClickResolver is module-mocked here, so the accessors are
    // never invoked — an empty galaxies/structures stub is enough.
    data: {
      structures: { byCategory: () => [] },
      galaxies: { get: () => undefined, famousMeta: [] },
    } as never,
    gpu: {
      renderer: {
        totalCount: () => 0,
        loadedSources: () => [],
      } as never,
      pickRenderer: null,
      // createPickRenderer binds the shared focus + lensing groups; the stub
      // only needs opaque bindGroup handles.
      focusUniform: { bindGroup: {} as GPUBindGroup },
      lensingBgl: {} as never,
      lensingUniform: { bindGroup: {} as GPUBindGroup },
      postProcess: null,
      filamentRenderer: null,
      labelRenderer: null,
      markerLineRenderer: null,
      texturedQuadRenderer: null,
      texturedDiskRenderer: null,
      proceduralDiskRenderer: null,
      milkyWayRenderer: null,
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
    initialCamSnapshot: null,
    cameraRuntime: {
      clock: createCameraClock(),
      projection: { fovYRad: 0, aspect: 1, near: 0.01, far: 50000 },
      lastPose: { current: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 } },
      prevActiveId: { current: 'resting' },
    },
    assetSlots: {
      points: new Map(),
      filaments: null,
      famousMeta: null,
      pgcAlias: null,
      cf4Density: null,
    },
  } as unknown as EngineState;
}

function makeDeps(): BootstrapDeps {
  const cb: EngineCallbacks = {
    store: configureStore({ reducer: rootReducer }),
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
    phaseLocals: {
      device: {} as GPUDevice,
      context: {} as GPUCanvasContext,
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('wireInput', () => {
  it('calls computeInitialCamera with the canonical 60° vertical FOV', async () => {
    const state = makeState();
    const deps = makeDeps();

    await wireInput(state, deps);

    expect(computeInitialCameraSpy).toHaveBeenCalledTimes(1);
    expect(computeInitialCameraSpy).toHaveBeenCalledWith({
      fovYRad: (Math.PI / 180) * 60,
    });
    expect(state.cam).not.toBeNull();
    expect(state.initialCamSnapshot).not.toBeNull();
  });

  it('runs to completion even with no catalogs loaded', async () => {
    // Progressive disclosure: wireInput must not require any galaxy catalog to
    // have arrived. Empty catalogs is the normal case at boot.
    const state = makeState();
    const deps = makeDeps();

    await wireInput(state, deps);

    expect(state.cam).not.toBeNull();
  });
});

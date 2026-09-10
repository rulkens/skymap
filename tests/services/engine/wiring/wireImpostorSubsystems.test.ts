/**
 * wireImpostorSubsystems — unit tests for the impostor-subsystem wiring
 * extracted from wireSlots.
 *
 * Two invariants targeted:
 *
 *   1. All five subsystem handles are assigned to `state.subsystems.*`
 *      after the call (galaxyAtlas, texturedDisks, proceduralDisks,
 *      hiResFamous, hiResFamousTexture).
 *
 *   2. The textured-disk renderer is bound to both the atlas view and the
 *      hi-res texture_2d_array view — without both, the renderer's
 *      `composeAtlasBindGroup()` gate never fires and the LOD-2/LOD-3
 *      pass is permanently dark.
 *
 * The disk renderers arrive as typed, non-null `disks` arguments now —
 * "both exist" is a compile-time fact this file no longer asserts at
 * runtime.
 *
 * Mocking strategy: stub the five GPU-bearing factory functions so no
 * real GPUDevice is needed; inject a stub `texturedDiskRenderer` with
 * spied bind methods to verify the bind contract.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';

// ── Module mocks ──────────────────────────────────────────────────────
//
// Each factory that allocates GPU resources needs a stub: they would call
// into the (absent) WebGPU device otherwise.  The stubs return minimal
// objects that satisfy the call sites in wireImpostorSubsystems.

vi.mock('../../../../src/services/engine/subsystems/galaxyAtlasSubsystem', () => ({
  createGalaxyAtlasSubsystem: vi.fn(() => ({
    getTextureView: vi.fn(() => ({ __atlas: true }) as unknown as GPUTextureView),
    destroy: vi.fn(),
  })),
}));

vi.mock('../../../../src/services/gpu/resources/hiResFamousTexture', () => ({
  createHiResFamousTexture: vi.fn(() => ({
    initTexture: vi.fn(),
    getTextureView: vi.fn(() => ({ __hiRes: true }) as unknown as GPUTextureView),
    getLayerSide: vi.fn(() => 1024),
    allocate: vi.fn(() => -1),
    touch: vi.fn(),
    release: vi.fn(),
    isLoaded: vi.fn(() => false),
    isFailed: vi.fn(() => false),
    markFailed: vi.fn(),
    layerForKey: vi.fn(() => undefined),
    uploadBitmap: vi.fn(),
    setEvictHandler: vi.fn(),
    destroy: vi.fn(),
  })),
}));

vi.mock('../../../../src/services/engine/subsystems/hiResFamousSubsystem', () => ({
  createHiResFamousSubsystem: vi.fn(() => ({
    runFrame: vi.fn(),
    lastOutput: { byFamousIdx: new Map() },
    destroy: vi.fn(),
  })),
}));

vi.mock('../../../../src/services/engine/subsystems/texturedDiskSubsystem', () => ({
  createTexturedDiskSubsystem: vi.fn(() => ({
    runFrame: vi.fn(),
    lastOutput: { disks: [] },
    hasInFlightWork: vi.fn(() => false),
    setHiResFamous: vi.fn(),
    destroy: vi.fn(),
  })),
}));

vi.mock('../../../../src/services/engine/subsystems/proceduralDiskSubsystem', () => ({
  createProceduralDiskSubsystem: vi.fn(() => ({
    runFrame: vi.fn(),
    lastOutput: { instances: [] },
    destroy: vi.fn(),
  })),
}));

// Import AFTER mocks so the module resolves the stubs.
import { wireImpostorSubsystems } from '../../../../src/services/engine/wiring/wireImpostorSubsystems';

// ── Helpers ───────────────────────────────────────────────────────────

/** Build a minimal EngineState for wireImpostorSubsystems (renderers arrive via the `disks` arg, not `state.gpu`). */
function makeState(): EngineState {
  return {
    tier: 'medium',
    settings: {},
    gpu: {},
    subsystems: {
      scheduler: { requestRender: vi.fn() },
      galaxyAtlas: null,
      texturedDisks: null,
      proceduralDisks: null,
      diskPlannerWalk: null,
      hiResFamous: null,
      hiResFamousTexture: null,
    },
  } as unknown as EngineState;
}

/** Build the `disks` argument, with spied bind methods on the textured-disk renderer. */
function makeDisks(texturedDiskRenderer?: { bindAtlas: () => void; bindHiResArray: () => void }) {
  const bindAtlas = vi.fn();
  const bindHiResArray = vi.fn();
  return {
    texturedDiskRenderer: texturedDiskRenderer ?? { bindAtlas, bindHiResArray },
    proceduralDiskRenderer: {},
  } as unknown as Parameters<typeof wireImpostorSubsystems>[2];
}

/** Build a minimal BootstrapDeps with the phaseLocals needed by wireImpostorSubsystems. */
function makeDeps(): BootstrapDeps {
  return {
    canvas: {} as HTMLCanvasElement,
    cb: {} as BootstrapDeps['cb'],
    home: {
      pose: () => ({
        target: [0, 0, 0],
        distance: 1,
        yaw: 0,
        pitch: 0,
        fovYRad: 1,
        near: 0.01,
        far: 100,
      }),
      focus: null,
      seedSelection: () => false,
    },
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

describe('wireImpostorSubsystems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assigns galaxyAtlas, texturedDisks, proceduralDisks, diskPlannerWalk, hiResFamous, hiResFamousTexture onto state.subsystems', () => {
    // All six subsystem handles must be non-null after the call.
    // The test verifies assignment without caring about the specific
    // objects returned by the (mocked) factories.
    const state = makeState();
    const deps = makeDeps();

    wireImpostorSubsystems(state, deps, makeDisks());

    expect(state.subsystems.galaxyAtlas).not.toBeNull();
    expect(state.subsystems.texturedDisks).not.toBeNull();
    expect(state.subsystems.proceduralDisks).not.toBeNull();
    expect(state.subsystems.diskPlannerWalk).not.toBeNull();
    expect(state.subsystems.hiResFamous).not.toBeNull();
    expect(state.subsystems.hiResFamousTexture).not.toBeNull();
  });

  it('binds the atlas and hi-res views into the textured-disk renderer', () => {
    // The textured-disk renderer's `composeAtlasBindGroup()` gate requires
    // BOTH `bindAtlas` and `bindHiResArray` to have fired before any draw
    // occurs.  Without this wire the LOD-2/LOD-3 pass is permanently dark.
    const bindAtlas = vi.fn();
    const bindHiResArray = vi.fn();
    const state = makeState();
    const deps = makeDeps();

    wireImpostorSubsystems(state, deps, makeDisks({ bindAtlas, bindHiResArray }));

    expect(bindAtlas).toHaveBeenCalledTimes(1);
    expect(bindHiResArray).toHaveBeenCalledTimes(1);
    // Each bind call receives the texture view from the matching factory.
    expect(bindAtlas).toHaveBeenCalledWith(expect.objectContaining({ __atlas: true }));
    expect(bindHiResArray).toHaveBeenCalledWith(expect.objectContaining({ __hiRes: true }));
  });
});

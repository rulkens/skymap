/**
 * wireImpostorSubsystems — unit tests for the impostor-subsystem wiring
 * extracted from wireSlots.
 *
 * Two invariants targeted:
 *
 *   1. All four subsystem handles are assigned to `state.subsystems.*`
 *      after the call (galaxyAtlas, texturedDisks, proceduralDisks,
 *      diskPlannerWalk).
 *
 *   2. The textured-disk renderer is bound to the atlas view — the other
 *      half of its `composeAtlasBindGroup()` gate, `bindHiResArray`, is the
 *      `hiResFamous` slot's job (see `wireHiResFamousSlot.test.ts`).
 *
 * Mocking strategy: stub the GPU-bearing factory functions so no real
 * GPUDevice is needed; inject a stub `texturedDiskRenderer` with spied bind
 * methods to verify the bind contract.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

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
  } as unknown as Parameters<typeof wireImpostorSubsystems>[2];
}

// ── Tests ────────────────────────────────────────────────────────────

describe('wireImpostorSubsystems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assigns galaxyAtlas, texturedDisks, proceduralDisks, diskPlannerWalk onto state.subsystems', () => {
    // All four subsystem handles must be non-null after the call.
    // The test verifies assignment without caring about the specific
    // objects returned by the (mocked) factories.
    const state = makeState();

    wireImpostorSubsystems(state, {} as GPUDevice, makeDisks());

    expect(state.subsystems.galaxyAtlas).not.toBeNull();
    expect(state.subsystems.texturedDisks).not.toBeNull();
    expect(state.subsystems.proceduralDisks).not.toBeNull();
    expect(state.subsystems.diskPlannerWalk).not.toBeNull();
  });

  it('binds the atlas view into the textured-disk renderer', () => {
    const bindAtlas = vi.fn();
    const bindHiResArray = vi.fn();
    const state = makeState();

    wireImpostorSubsystems(state, {} as GPUDevice, makeDisks({ bindAtlas, bindHiResArray }));

    expect(bindAtlas).toHaveBeenCalledTimes(1);
    expect(bindAtlas).toHaveBeenCalledWith(expect.objectContaining({ __atlas: true }));
    // The hi-res half of the `composeAtlasBindGroup()` gate belongs to the slot.
    expect(bindHiResArray).not.toHaveBeenCalled();
  });
});

/**
 * rebuildHiResFamousForTier — tier-change destroy + recreate orchestrator.
 *
 * On tier flip: the old hi-res texture + planner pair is torn down
 * (subsystem first, then texture — matching the destroy() ordering
 * invariant), a new pair is created at the tier-derived layerSide, the
 * renderer's hi-res view is re-bound to the new texture, and the
 * textured-disk subsystem's planner reference is swapped.
 *
 * The helper is the testable seam — `engine.setTier` is a thin wrapper
 * over this call. Mocking the factories pins the construction +
 * teardown sequence without standing up a real GPU device.
 */

import { describe, expect, it, vi } from 'vitest';
import { rebuildHiResFamousForTier } from '../../../../src/services/engine/helpers/rebuildHiResFamousForTier';
import { HI_RES_LAYER_COUNT } from '../../../../src/data/sources';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type {
  CreateHiResFamousTextureArgs,
  HiResFamousTexture,
} from '../../../../src/@types/rendering/HiResFamousTexture';
import type {
  HiResFamousFrameOutput,
  HiResFamousSubsystem,
} from '../../../../src/@types/engine/subsystems/HiResFamousSubsystem';
import type { TexturedDiskSubsystem } from '../../../../src/@types/engine/subsystems/TexturedDiskSubsystem';
import { noopDiskRowVisitor } from '../subsystems/diskWalkHarness';

// ── Test helpers ─────────────────────────────────────────────────────

function makeFakeTexture(layerSide: number): HiResFamousTexture & {
  __destroyCalled: { value: boolean };
} {
  const __destroyCalled = { value: false };
  return {
    __destroyCalled,
    initTexture: vi.fn(),
    allocate: vi.fn(() => -1),
    touch: vi.fn(),
    release: vi.fn(),
    isLoaded: vi.fn(() => false),
    isFailed: vi.fn(() => false),
    markFailed: vi.fn(),
    layerForKey: vi.fn(() => undefined),
    uploadBitmap: vi.fn(),
    getTextureView: vi.fn(() => ({ __view: layerSide }) as unknown as GPUTextureView),
    getLayerSide: vi.fn(() => layerSide),
    setEvictHandler: vi.fn(),
    destroy: vi.fn(() => {
      __destroyCalled.value = true;
    }),
  };
}

function makeFakeSubsystem(): HiResFamousSubsystem & {
  __destroyCalled: { value: boolean };
} {
  const __destroyCalled = { value: false };
  const lastOutput: HiResFamousFrameOutput = { byFamousIdx: new Map() };
  return {
    __destroyCalled,
    runFrame: vi.fn(() => lastOutput),
    get lastOutput() {
      return lastOutput;
    },
    destroy: vi.fn(() => {
      __destroyCalled.value = true;
    }),
  };
}

function makeFakeTexturedDisks(): TexturedDiskSubsystem & {
  __setHiResFamousCalls: Array<HiResFamousSubsystem | undefined>;
} {
  const __setHiResFamousCalls: Array<HiResFamousSubsystem | undefined> = [];
  return {
    __setHiResFamousCalls,
    beginFrame: vi.fn<TexturedDiskSubsystem['beginFrame']>(() => noopDiskRowVisitor()),
    lastOutput: { disks: [] },
    hasInFlightWork: vi.fn(() => false),
    setHiResFamous: vi.fn((next) => {
      __setHiResFamousCalls.push(next);
    }),
    destroy: vi.fn(),
  };
}

function makeMinimalState(opts: {
  hiResFamousTexture: HiResFamousTexture | null;
  hiResFamous: HiResFamousSubsystem | null;
  texturedDisks: TexturedDiskSubsystem | null;
}): EngineState {
  return {
    subsystems: {
      hiResFamousTexture: opts.hiResFamousTexture,
      hiResFamous: opts.hiResFamous,
      texturedDisks: opts.texturedDisks,
    },
  } as unknown as EngineState;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('rebuildHiResFamousForTier', () => {
  it('tier change destroys + recreates the hi-res famous texture at the new layerSide', () => {
    // Post-bootstrap shape: a 1024 px texture (medium tier default) +
    // matching planner are already in place.
    const oldTexture = makeFakeTexture(1024);
    const oldSubsystem = makeFakeSubsystem();
    const texturedDisks = makeFakeTexturedDisks();
    const state = makeMinimalState({
      hiResFamousTexture: oldTexture,
      hiResFamous: oldSubsystem,
      texturedDisks,
    });

    // Capture call ORDER across the two factories + the two destroys.
    // The planner subscribes to the texture's evict handler, so the
    // subsystem must be torn down before the texture (same invariant
    // `engine.destroy()` enforces).
    const events: string[] = [];

    const newSubsystem = makeFakeSubsystem();
    const newTexture = makeFakeTexture(512);

    oldSubsystem.destroy = vi.fn(() => {
      events.push('oldSubsystem.destroy');
    });
    oldTexture.destroy = vi.fn(() => {
      events.push('oldTexture.destroy');
    });
    const createTextureFn = vi.fn((args: CreateHiResFamousTextureArgs) => {
      events.push(`createTexture(${args.layerSide})`);
      return newTexture;
    });
    const createSubsystemFn = vi.fn(() => {
      events.push('createSubsystem');
      return newSubsystem;
    });

    const bindHiResArray = vi.fn(() => {
      events.push('bindHiResArray');
    });

    rebuildHiResFamousForTier({
      state,
      device: {} as GPUDevice,
      tier: 'small',
      texturedDiskRenderer: { bindHiResArray },
      requestRender: () => {},
      createTextureFn,
      createSubsystemFn,
    });

    // (a) Old subsystem destroyed BEFORE the new factories ran — the
    //     load-bearing teardown invariant.
    const oldSubDestroyIdx = events.indexOf('oldSubsystem.destroy');
    const oldTexDestroyIdx = events.indexOf('oldTexture.destroy');
    const createTextureIdx = events.findIndex((e) => e.startsWith('createTexture('));
    const createSubsystemIdx = events.indexOf('createSubsystem');
    expect(oldSubDestroyIdx).toBeGreaterThanOrEqual(0);
    expect(oldTexDestroyIdx).toBeGreaterThanOrEqual(0);
    expect(createTextureIdx).toBeGreaterThanOrEqual(0);
    expect(createSubsystemIdx).toBeGreaterThanOrEqual(0);
    // Subsystem first, then texture (mirrors engine.destroy()).
    expect(oldSubDestroyIdx).toBeLessThan(oldTexDestroyIdx);
    // Both destroys before either factory ran.
    expect(oldSubDestroyIdx).toBeLessThan(createTextureIdx);
    expect(oldTexDestroyIdx).toBeLessThan(createTextureIdx);
    expect(oldSubDestroyIdx).toBeLessThan(createSubsystemIdx);

    // (b) New texture factory invoked at the new tier's layerSide
    //     ('small' resolves to 512 px).
    expect(createTextureFn).toHaveBeenCalledTimes(1);
    expect(createTextureFn).toHaveBeenCalledWith({
      device: expect.any(Object),
      layerSide: 512,
      layerCount: HI_RES_LAYER_COUNT,
    });

    // (c) New subsystem factory was invoked with the new texture handle.
    expect(createSubsystemFn).toHaveBeenCalledTimes(1);
    expect(createSubsystemFn).toHaveBeenCalledWith(
      expect.objectContaining({ texture: newTexture }),
    );

    // (d) initTexture() ran on the new texture before getTextureView()
    //     (the helper calls both internally).
    expect(newTexture.initTexture).toHaveBeenCalled();

    // (e) Renderer's hi-res view was re-bound to the NEW texture's view.
    expect(bindHiResArray).toHaveBeenCalledTimes(1);
    expect(bindHiResArray).toHaveBeenCalledWith({ __view: 512 });

    // (f) The textured-disk subsystem's planner reference was swapped:
    //     first call clears (undefined), then the new instance lands.
    expect(texturedDisks.__setHiResFamousCalls.length).toBe(2);
    expect(texturedDisks.__setHiResFamousCalls[0]).toBeUndefined();
    expect(texturedDisks.__setHiResFamousCalls[1]).toBe(newSubsystem);

    // (g) Live handles on EngineState now point at the new instances.
    expect(state.subsystems.hiResFamousTexture).toBe(newTexture);
    expect(state.subsystems.hiResFamous).toBe(newSubsystem);
  });

  it('null prior handles are tolerated (boot-before-tier-flip edge)', () => {
    // If setTier somehow fires before the initial bootstrap minted the
    // hi-res pair, the helper must not NPE on the optional-chain destroys.
    // Both should be no-ops and the new pair should still be created.
    const texturedDisks = makeFakeTexturedDisks();
    const state = makeMinimalState({
      hiResFamousTexture: null,
      hiResFamous: null,
      texturedDisks,
    });

    const newSubsystem = makeFakeSubsystem();
    const newTexture = makeFakeTexture(1024);
    const createTextureFn = vi.fn(() => newTexture);
    const createSubsystemFn = vi.fn(() => newSubsystem);

    expect(() =>
      rebuildHiResFamousForTier({
        state,
        device: {} as GPUDevice,
        tier: 'medium',
        texturedDiskRenderer: { bindHiResArray: vi.fn() },
        requestRender: () => {},
        createTextureFn,
        createSubsystemFn,
      }),
    ).not.toThrow();

    expect(state.subsystems.hiResFamousTexture).toBe(newTexture);
    expect(state.subsystems.hiResFamous).toBe(newSubsystem);
  });

  it('absent texturedDisks does not block the rebuild', () => {
    // If texturedDisks is null (rare — only in tests or mid-destroy),
    // the helper still rebuilds the hi-res pair so a subsequent
    // texturedDisks construction picks up the live reference via
    // state.subsystems.hiResFamous.
    const oldTexture = makeFakeTexture(1024);
    const oldSubsystem = makeFakeSubsystem();
    const state = makeMinimalState({
      hiResFamousTexture: oldTexture,
      hiResFamous: oldSubsystem,
      texturedDisks: null,
    });

    const newSubsystem = makeFakeSubsystem();
    const newTexture = makeFakeTexture(512);

    rebuildHiResFamousForTier({
      state,
      device: {} as GPUDevice,
      tier: 'small',
      texturedDiskRenderer: { bindHiResArray: vi.fn() },
      requestRender: () => {},
      createTextureFn: vi.fn(() => newTexture),
      createSubsystemFn: vi.fn(() => newSubsystem),
    });

    expect(oldSubsystem.__destroyCalled.value).toBe(true);
    expect(oldTexture.__destroyCalled.value).toBe(true);
    expect(state.subsystems.hiResFamous).toBe(newSubsystem);
  });
});

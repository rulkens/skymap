/**
 * wireHiResFamousSlot — the hi-res famous pair as a demand-loop slot.
 *
 * The load is a GPU allocation rather than a fetch, so the whole contract is in
 * `commit`'s ORDER: bind the new view, hand the new planner to the textured-disk
 * subsystem, and only then destroy the pair that was live. Reversing any of that
 * drops every visible famous galaxy to its atlas tile for the frames between —
 * precisely what a tier flip must not do.
 *
 * Factory stubs stand in for the two GPU-bearing constructors; the ordering
 * assertions read a shared call log the stubs append to.
 *
 * The pair to retire is the one the renderer has BOUND, tracked by the wiring
 * itself: a pair superseded mid-commit was bound but never became the slot's
 * committed value, so `slot.committed()` would name the wrong one.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HI_RES_LAYER_COUNT, HI_RES_LAYER_SIDE_BY_TIER } from '../../../../src/data/sources';
import type { Tier } from '../../../../src/@types/data/Tier';
import type { TexturedDiskRenderer } from '../../../../src/@types/rendering/TexturedDiskRenderer';

/** The hi-res row's request, mirroring `ASSET_WIRING`'s `req` for that row. */
const reqFor = (tier: Tier) => ({ layerSide: HI_RES_LAYER_SIDE_BY_TIER[tier] });

/** Hoisted so the `vi.mock` factories (evaluated before this module's body) can reach it. */
const shared = vi.hoisted(() => ({ calls: [] as string[], textureSeq: 0, subsystemSeq: 0 }));

vi.mock('../../../../src/services/gpu/resources/hiResFamousTexture', () => ({
  createHiResFamousTexture: vi.fn(() => {
    const id = `texture#${shared.textureSeq++}`;
    return {
      initTexture: vi.fn(),
      getTextureView: vi.fn(() => ({ __view: id }) as unknown as GPUTextureView),
      destroy: vi.fn(() => shared.calls.push(`destroy ${id}`)),
      __id: id,
    };
  }),
}));

vi.mock('../../../../src/layers/galaxyCatalog/subsystems/hiResFamousSubsystem', () => ({
  createHiResFamousSubsystem: vi.fn(() => {
    const id = `subsystem#${shared.subsystemSeq++}`;
    return {
      runFrame: vi.fn(),
      lastOutput: { byFamousIdx: new Map() },
      destroy: vi.fn(() => shared.calls.push(`destroy ${id}`)),
      __id: id,
    };
  }),
}));

// Imported AFTER the mocks so the module under test resolves the stubs.
import { wireHiResFamousSlot } from '../../../../src/layers/galaxyCatalog/load/wireHiResFamousSlot';
import { createHiResFamousTexture } from '../../../../src/services/gpu/resources/hiResFamousTexture';

function makeSlot() {
  const texturedDiskRenderer: Pick<TexturedDiskRenderer, 'bindHiResArray'> = {
    bindHiResArray: vi.fn((v: GPUTextureView) =>
      shared.calls.push(`bind ${(v as unknown as { __view: string }).__view}`),
    ),
  };
  return wireHiResFamousSlot({
    device: {} as GPUDevice,
    requestRender: vi.fn(),
    texturedDiskRenderer,
    texturedDisks: {
      setHiResFamous: vi.fn((s: { __id?: string } | undefined) =>
        shared.calls.push(`setHiResFamous ${s?.__id}`),
      ),
    } as never,
  });
}

describe('wireHiResFamousSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shared.calls.length = 0;
    shared.textureSeq = 0;
    shared.subsystemSeq = 0;
  });

  it('allocates the array at the requested layerSide', async () => {
    const slot = makeSlot();

    await slot.load(reqFor('small'));
    expect(createHiResFamousTexture).toHaveBeenLastCalledWith(
      expect.objectContaining({ layerSide: 512, layerCount: HI_RES_LAYER_COUNT }),
    );

    await slot.load(reqFor('medium'));
    expect(createHiResFamousTexture).toHaveBeenLastCalledWith(
      expect.objectContaining({ layerSide: 1024, layerCount: HI_RES_LAYER_COUNT }),
    );
  });

  it('binds the new view and hands over the new planner before destroying the old pair', async () => {
    const slot = makeSlot();

    await slot.load(reqFor('small'));
    await slot.load(reqFor('medium'));

    // The first commit destroys nothing; on the second, subsystem before
    // texture on the teardown half, because the planner holds the texture's
    // evict-handler subscription.
    expect(shared.calls).toEqual([
      'bind texture#0',
      'setHiResFamous subsystem#0',
      'bind texture#1',
      'setHiResFamous subsystem#1',
      'destroy subsystem#0',
      'destroy texture#0',
    ]);
  });

  // The "fetch" allocates the GPU texture, so a load superseded before its commit
  // must destroy the pair it built: nothing else ever sees it.
  it('destroys a pair superseded before its commit', async () => {
    const slot = makeSlot();

    void slot.load(reqFor('small'));
    await slot.load(reqFor('medium'));

    expect(shared.calls).toEqual([
      'destroy subsystem#0',
      'destroy texture#0',
      'bind texture#1',
      'setHiResFamous subsystem#1',
    ]);
  });

  // A pair superseded mid-commit was bound but never became the slot's committed
  // value, so the next commit must retire what is bound, not what the slot holds.
  it('retires a pair superseded mid-commit when the next one binds', async () => {
    const slot = makeSlot();
    let superseded = false;
    slot.subscribe((state) => {
      if (state.kind === 'committing' && !superseded) {
        superseded = true;
        void slot.load(reqFor('medium'));
      }
    });

    await slot.load(reqFor('small'));
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(shared.calls).toEqual([
      'bind texture#0',
      'setHiResFamous subsystem#0',
      'bind texture#1',
      'setHiResFamous subsystem#1',
      'destroy subsystem#0',
      'destroy texture#0',
    ]);
  });
});

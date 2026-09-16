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
 * It is also the pin for `AssetSlot`'s commit-before-`committed` ordering: the
 * previous pair is read from `slot.committed()` INSIDE `commit`, which is only
 * the old value because `AssetSlot` awaits `commit` before dispatching the
 * `committed` event. A later `AssetSlot` refactor that reorders those two
 * fails here — and should read the failure as its own, not re-point this test.
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
});

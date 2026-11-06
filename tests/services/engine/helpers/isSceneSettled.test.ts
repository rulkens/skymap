/**
 * isSceneSettled — the cold-load gate's one question. What can fail: a slot
 * mid-load, a Layer still streaming, or a fade still running reads as settled,
 * and the tour opens on a half-built scene.
 */
import { describe, expect, it } from 'vitest';

import { isSceneSettled } from '../../../../src/services/engine/helpers/isSceneSettled';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { AssetKey } from '../../../../src/@types/loading/AssetKey';

type Slots = ReadonlyMap<AssetKey, AssetSlot<unknown, unknown>>;
const slotIn = (state: LoadState<unknown>) =>
  ({ state: () => state }) as unknown as AssetSlot<unknown, unknown>;
const slots = (entries: [string, AssetSlot<unknown, unknown>][]): Slots =>
  new Map(entries.map(([k, v]) => [k as AssetKey, v]));

const READY: LoadState<unknown> = { kind: 'ready', req: null, value: 1, loadedAtMs: 0 };
const LOADING: LoadState<unknown> = { kind: 'loading', req: null, loaded: 0, total: 1, attempt: 0 };

const settled = {
  booted: true,
  fadesAnimating: false,
  layersLoading: false,
  slotsByKey: slots([
    ['a', slotIn(READY)],
    ['b', slotIn({ kind: 'idle' })],
  ]),
};

describe('isSceneSettled', () => {
  it('is true once every slot is idle or ready and nothing streams or fades', () => {
    expect(isSceneSettled(settled)).toBe(true);
  });

  it('is false before the engine has booted', () => {
    expect(isSceneSettled({ ...settled, booted: false })).toBe(false);
  });

  it('is false while any slot is loading or committing', () => {
    const loading = slots([['mesh', slotIn(LOADING)]]);
    expect(isSceneSettled({ ...settled, slotsByKey: loading })).toBe(false);
    const committing = slots([['mesh', slotIn({ kind: 'committing', req: null })]]);
    expect(isSceneSettled({ ...settled, slotsByKey: committing })).toBe(false);
  });

  it('is false while a Layer voted loading last frame', () => {
    expect(isSceneSettled({ ...settled, layersLoading: true })).toBe(false);
  });

  it('is false while a fade is running', () => {
    expect(isSceneSettled({ ...settled, fadesAnimating: true })).toBe(false);
  });
});

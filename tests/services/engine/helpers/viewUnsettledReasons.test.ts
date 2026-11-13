/**
 * viewUnsettledReasons — what a screenshot waits on. What can fail: a shot taken
 * while the focus flight still runs (the frame shows where it started, Earth) or
 * before the assets its destination asks for have arrived.
 */
import { describe, expect, it } from 'vitest';

import { viewUnsettledReasons } from '../../../../src/services/engine/helpers/viewUnsettledReasons';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { AssetKey } from '../../../../src/@types/loading/AssetKey';
import type { CameraIntentState } from '../../../../src/@types/camera/orbitCamera/CameraIntentState';

const loadingSlot = {
  state: () => ({ kind: 'loading', req: null, loaded: 0, total: 1, attempt: 0 }),
} as unknown as AssetSlot<unknown, unknown>;
const scene = { booted: true, fadesAnimating: false, layersLoading: false, slotsByKey: new Map() };
const still = { tween: null, frameTween: null };

describe('viewUnsettledReasons', () => {
  it('is empty for a still camera over a settled scene', () => {
    expect(viewUnsettledReasons(scene, still)).toEqual([]);
  });

  it('names a focus flight and a frame turn', () => {
    const tween = {} as CameraIntentState['tween'];
    const frameTween = {} as CameraIntentState['frameTween'];
    expect(viewUnsettledReasons(scene, { tween, frameTween })).toEqual([
      'camera flight',
      'frame turn',
    ]);
  });

  it('names the asset a demand started loading', () => {
    const slotsByKey = new Map([['cosmic-web' as AssetKey, loadingSlot]]);
    expect(viewUnsettledReasons({ ...scene, slotsByKey }, still)).toEqual([
      'asset cosmic-web loading',
    ]);
  });
});

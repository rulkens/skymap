import { describe, it, expect } from 'vitest';
import { hiResLayerFold } from '../../../../src/utils/render/disk/hiResLayerFold';
import type { HiResFamousPerGalaxyState } from '../../../../src/@types/engine/subsystems/HiResFamousSubsystem';

describe('hiResLayerFold', () => {
  it('folds the -1/0 sentinel when the map is undefined (no hi-res planner)', () => {
    expect(hiResLayerFold(undefined, 7)).toEqual({ hiResLayerIdx: -1, hiResCrossfadeAlpha: 0 });
  });

  it('folds the sentinel for a row the map has no entry for', () => {
    const map = new Map<number, HiResFamousPerGalaxyState>();
    expect(hiResLayerFold(map, 3)).toEqual({ hiResLayerIdx: -1, hiResCrossfadeAlpha: 0 });
  });

  it('returns the assigned layer + crossfade for a present row', () => {
    const map = new Map<number, HiResFamousPerGalaxyState>([
      [3, { hiResLayerIdx: 2, hiResCrossfadeAlpha: 0.4 }],
    ]);
    expect(hiResLayerFold(map, 3)).toEqual({ hiResLayerIdx: 2, hiResCrossfadeAlpha: 0.4 });
  });
});

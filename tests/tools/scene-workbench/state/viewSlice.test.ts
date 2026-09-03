import { describe, expect, it } from 'vitest';
import {
  defaultViewSlice,
  PITCH_LIMIT,
  viewSlice,
} from '../../../../tools/scene-workbench/src/state/view/viewSlice';

describe('viewSlice toggleAssetVisibility', () => {
  it('adds then removes an id', () => {
    const hidden = viewSlice.reducer(
      defaultViewSlice,
      viewSlice.actions.toggleAssetVisibility('asset-1'),
    );
    expect(hidden.hiddenAssetIds).toEqual(['asset-1']);

    const shown = viewSlice.reducer(hidden, viewSlice.actions.toggleAssetVisibility('asset-1'));
    expect(shown.hiddenAssetIds).toEqual([]);
  });
});

describe('viewSlice commitCameraPose', () => {
  it('clamps pitch to the pole limit', () => {
    const over = viewSlice.reducer(
      defaultViewSlice,
      viewSlice.actions.commitCameraPose({
        yaw: 0,
        pitch: PITCH_LIMIT + 1,
        distanceM: 10,
        targetM: [0, 0, 0],
      }),
    );
    expect(over.camera.pitch).toBe(PITCH_LIMIT);

    const under = viewSlice.reducer(
      defaultViewSlice,
      viewSlice.actions.commitCameraPose({
        yaw: 0,
        pitch: -PITCH_LIMIT - 1,
        distanceM: 10,
        targetM: [0, 0, 0],
      }),
    );
    expect(under.camera.pitch).toBe(-PITCH_LIMIT);
  });
});

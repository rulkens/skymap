import { describe, expect, it } from 'vitest';

import type { Vec2 } from '../../../../src/@types/math/Vec2';
import {
  draftStarted,
  maskToggled,
  outlineLoaded,
} from '../../../../tools/scene-workbench/src/state/outline/outlineSlice';
import { selectMaskRing } from '../../../../tools/scene-workbench/src/state/outline/selectMaskRing';
import { defaultViewSlice } from '../../../../tools/scene-workbench/src/state/view/viewSlice';
import { createSceneStore } from '../../../../tools/scene-workbench/src/store/createSceneStore';

const SAVED: Vec2[] = [
  [0, 0],
  [1, 0],
  [0, 1],
];
const DRAFT: Vec2[] = [[9, 9]];

describe('selectMaskRing', () => {
  it('selectMaskRing prefers the draft over a saved ring', () => {
    const { store } = createSceneStore();
    store.dispatch(outlineLoaded({ assetId: 'mesh', ringM: SAVED }));
    store.dispatch(
      draftStarted({
        assetId: 'mesh',
        ringM: DRAFT,
        closed: false,
        returnPose: defaultViewSlice.camera,
      }),
    );
    expect(selectMaskRing(store.getState(), 'mesh')).toEqual(DRAFT);
  });

  it('selectMaskRing is null when masked off', () => {
    const { store } = createSceneStore();
    store.dispatch(outlineLoaded({ assetId: 'mesh', ringM: SAVED }));
    store.dispatch(maskToggled('mesh'));
    expect(selectMaskRing(store.getState(), 'mesh')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import type { Vec2 } from '../../../../src/@types/math/Vec2';
import {
  cornerAppended,
  cornerClicked,
  cornerInserted,
  cornerMoved,
  defaultOutlineSlice,
  draftStarted,
  outlineSlice,
  type OutlineSlice,
} from '../../../../tools/scene-workbench/src/state/outline/outlineSlice';
import { defaultViewSlice } from '../../../../tools/scene-workbench/src/state/view/viewSlice';

const TRIANGLE: Vec2[] = [
  [0, 0],
  [1, 0],
  [0, 1],
];

function drafting(ringM: Vec2[], closed: boolean): OutlineSlice {
  return outlineSlice.reducer(
    defaultOutlineSlice,
    draftStarted({ assetId: 'mesh', ringM, closed, returnPose: defaultViewSlice.camera }),
  );
}

describe('outlineSlice', () => {
  it('cornerClicked on the first corner of an open triangle closes it', () => {
    const next = outlineSlice.reducer(drafting(TRIANGLE, false), cornerClicked(0));
    expect(next.draft).toMatchObject({ closed: true, ringM: TRIANGLE });
  });

  it('cornerClicked deletes a corner and reopens a ring that falls below three', () => {
    const next = outlineSlice.reducer(drafting(TRIANGLE, true), cornerClicked(0));
    expect(next.draft).toMatchObject({
      closed: false,
      ringM: [
        [1, 0],
        [0, 1],
      ],
    });
  });

  it('cornerAppended is ignored on a closed ring', () => {
    const next = outlineSlice.reducer(drafting(TRIANGLE, true), cornerAppended([5, 5]));
    expect(next.draft?.ringM).toEqual(TRIANGLE);
  });

  it('cornerInserted splices into a closed ring, the closing edge included, and ignores out-of-range', () => {
    const state = drafting(TRIANGLE, true);
    expect(
      outlineSlice.reducer(state, cornerInserted({ index: 1, xyM: [0.5, 0] })).draft?.ringM,
    ).toEqual([
      [0, 0],
      [0.5, 0],
      [1, 0],
      [0, 1],
    ]);
    expect(
      outlineSlice.reducer(state, cornerInserted({ index: 3, xyM: [0, 0.5] })).draft?.ringM,
    ).toEqual([...TRIANGLE, [0, 0.5]]);
    expect(
      outlineSlice.reducer(state, cornerInserted({ index: 4, xyM: [9, 9] })).draft?.ringM,
    ).toEqual(TRIANGLE);
  });

  it('cornerMoved on an out-of-range index is ignored', () => {
    const state = drafting(TRIANGLE, false);
    expect(
      outlineSlice.reducer(state, cornerMoved({ index: 3, xyM: [9, 9] })).draft?.ringM,
    ).toEqual(TRIANGLE);
    expect(
      outlineSlice.reducer(state, cornerMoved({ index: -1, xyM: [9, 9] })).draft?.ringM,
    ).toEqual(TRIANGLE);
  });
});

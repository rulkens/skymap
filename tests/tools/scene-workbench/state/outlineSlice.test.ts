import { describe, expect, it } from 'vitest';

import type { Vec2 } from '../../../../src/@types/math/Vec2';
import {
  cornerAppended,
  cornerClicked,
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
});

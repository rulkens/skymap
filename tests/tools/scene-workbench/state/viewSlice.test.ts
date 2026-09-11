/**
 * viewSlice — the splat clip box. `null` is the no-clipping path the sort
 * and the renderer both key on, so setting and clearing it must round-trip
 * without disturbing the sibling display knobs the same nested object holds.
 */
import { describe, expect, it } from 'vitest';

import type { BoundsM } from '../../../../tools/scene-workbench/@types/BoundsM';
import {
  defaultViewSlice,
  setSplatClipBox,
  viewSlice,
} from '../../../../tools/scene-workbench/src/state/view/viewSlice';

describe('viewSlice.setSplatClipBox', () => {
  it('sets and clears the box without touching the splat knobs beside it', () => {
    const boxM: BoundsM = { min: [-1, -2, -3], max: [4, 5, 6] };

    const set = viewSlice.reducer(defaultViewSlice, setSplatClipBox(boxM));
    expect(set.display.gaussianSplat).toEqual({
      splatScale: 1,
      opacityScale: 1,
      clipBoxM: boxM,
    });

    const cleared = viewSlice.reducer(set, setSplatClipBox(null));
    expect(cleared.display.gaussianSplat).toEqual({
      splatScale: 1,
      opacityScale: 1,
      clipBoxM: null,
    });
  });
});

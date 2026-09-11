/**
 * viewSlice — the splat clip box, whose `null` is the no-clipping path the
 * sort and the renderer both key on, and the opening camera frame.
 */
import { describe, expect, it } from 'vitest';

import type { BoundsM } from '../../../../tools/scene-workbench/@types/BoundsM';
import {
  defaultViewSlice,
  frameCamera,
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

describe('viewSlice.frameCamera', () => {
  it('centres an off-origin asymmetric box and backs off its wider horizontal extent', () => {
    const boxM: BoundsM = { min: [10, -30, 0], max: [110, 20, 40] };

    const framed = viewSlice.reducer(defaultViewSlice, frameCamera(boxM));

    expect(framed.camera.targetM).toEqual([60, -5, 20]);
    expect(framed.camera.distanceM).toBe(90);
    expect(framed.camera.yaw).toBe(defaultViewSlice.camera.yaw);
    expect(framed.camera.pitch).toBe(defaultViewSlice.camera.pitch);
  });
});

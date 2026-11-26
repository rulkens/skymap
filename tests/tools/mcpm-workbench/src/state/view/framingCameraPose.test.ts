import { describe, expect, it } from 'vitest';
import { deriveGridBox } from '../../../../../../tools/mcpm-workbench/src/grid/deriveGridBox';
import { defaultGridSlice } from '../../../../../../tools/mcpm-workbench/src/state/grid/gridSlice';
import { framingCameraPose } from '../../../../../../tools/mcpm-workbench/src/state/view/framingCameraPose';
import { defaultViewSlice } from '../../../../../../tools/mcpm-workbench/src/state/view/viewSlice';

describe('framingCameraPose', () => {
  it('frames the boot box with the pose reset restores', () => {
    expect(framingCameraPose(deriveGridBox(defaultGridSlice))).toEqual(defaultViewSlice.camera);
  });

  it('centres on the box and backs off with its longest edge', () => {
    const boot = deriveGridBox(defaultGridSlice);
    const pose = framingCameraPose({
      centerMpc: [100, -20, 5],
      sizeMpc: [boot.sizeMpc[0], 3 * boot.sizeMpc[1], boot.sizeMpc[2]],
    });

    expect(pose.targetMpc).toEqual([100, -20, 5]);
    expect(pose.distance).toBeCloseTo(3 * defaultViewSlice.camera.distance);
  });
});

import { describe, expect, it } from 'vitest';

import type { Vec2 } from '../../../../src/@types/math/Vec2';
import { sceneCameraView } from '../../../../tools/scene-workbench/src/render/sceneCameraView';
import { groupXYToPx } from '../../../../tools/scene-workbench/src/scene/groupXYToPx';
import { pxToGroupXY } from '../../../../tools/scene-workbench/src/scene/pxToGroupXY';

describe('groupXYToPx', () => {
  it('groupXYToPx inverts pxToGroupXY', () => {
    const view = sceneCameraView(
      { yaw: 0.9, pitch: 0.3, distanceM: 70, targetM: [12, -40, 3], projection: 'orthographic' },
      [1024, 640],
    );

    const pixels: Vec2[] = [
      [0, 0],
      [512.5, 100.25],
      [1000, 633],
    ];
    for (const px of pixels) {
      const back = groupXYToPx(view, pxToGroupXY(view, px));
      expect(back[0]).toBeCloseTo(px[0], 9);
      expect(back[1]).toBeCloseTo(px[1], 9);
    }
  });
});

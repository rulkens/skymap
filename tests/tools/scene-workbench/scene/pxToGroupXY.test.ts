import { describe, expect, it } from 'vitest';

import { sceneCameraView } from '../../../../tools/scene-workbench/src/render/sceneCameraView';
import { pxToGroupXY } from '../../../../tools/scene-workbench/src/scene/pxToGroupXY';

describe('pxToGroupXY', () => {
  it('pxToGroupXY maps the top-right pixel to target + right·h·aspect + up·h', () => {
    // yaw 0: the eye sits on the target's +X side, so screen up is -X and screen right is +Y.
    // distanceM makes h = 10; aspect 2 ⇒ the corner is target + (-10, +20).
    const view = sceneCameraView(
      {
        yaw: 0,
        pitch: 0.3,
        distanceM: 10 / Math.tan(Math.PI / 8),
        targetM: [5, -3, 2],
        projection: 'orthographic',
      },
      [800, 400],
    );

    const [x, y] = pxToGroupXY(view, [800, 0]);

    expect(x).toBeCloseTo(-5, 9);
    expect(y).toBeCloseTo(17, 9);
  });
});

import { describe, expect, it } from 'vitest';

import { sceneCameraView } from '../../../../tools/scene-workbench/src/render/sceneCameraView';

describe('sceneCameraView', () => {
  it('places the eye and screen axes for a quarter-turn yaw', () => {
    const view = sceneCameraView(
      { yaw: Math.PI / 2, pitch: 0, distanceM: 100, targetM: [10, 0, 0] },
      [800, 600],
    );

    expect(view.eyeM[0]).toBeCloseTo(110);
    expect(view.eyeM[1]).toBeCloseTo(0);
    expect(view.eyeM[2]).toBeCloseTo(0);

    expect(view.rightM[0]).toBeCloseTo(0);
    expect(view.rightM[1]).toBeCloseTo(0);
    expect(view.rightM[2]).toBeCloseTo(-1);

    expect(view.upM[0]).toBeCloseTo(0);
    expect(view.upM[1]).toBeCloseTo(1);
    expect(view.upM[2]).toBeCloseTo(0);
  });

  it('keeps the basis finite looking straight down', () => {
    const view = sceneCameraView(
      { yaw: 0.7, pitch: Math.PI / 2 - 1e-9, distanceM: 50, targetM: [0, 0, 0] },
      [800, 600],
    );

    for (const v of [view.eyeM, view.rightM, view.upM, view.targetM]) {
      for (const c of v) expect(Number.isFinite(c)).toBe(true);
    }
  });
});

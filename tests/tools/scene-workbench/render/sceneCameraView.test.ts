import { describe, expect, it } from 'vitest';

import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { sceneCameraView } from '../../../../tools/scene-workbench/src/render/sceneCameraView';

describe('sceneCameraView', () => {
  it('places the eye and screen axes for a quarter-turn yaw', () => {
    // Z-up ENU derivation (see sceneCameraView.ts's ENU_UP_BASIS): at
    // yaw=π/2, pitch=0 the Y-up decode is dirLocal=[1,0,0], which
    // ENU_UP_BASIS rotates to world dir=[0,1,0] (yaw=0 would give +X; a
    // quarter-turn swings the eye to +Y, still level with the target).
    // eyeM = targetM + 100·[0,1,0] = [10,100,0].
    // forward (eye→target) = [0,-1,0]; upRef = +Z ⇒
    // rightM = normalize(forward × upRef) = [-1,0,0],
    // upM = normalize(rightM × forward) = [0,0,1].
    const view = sceneCameraView(
      { yaw: Math.PI / 2, pitch: 0, distanceM: 100, targetM: [10, 0, 0] },
      [800, 600],
    );

    expect(view.eyeM[0]).toBeCloseTo(10);
    expect(view.eyeM[1]).toBeCloseTo(100);
    expect(view.eyeM[2]).toBeCloseTo(0);

    expect(view.rightM[0]).toBeCloseTo(-1);
    expect(view.rightM[1]).toBeCloseTo(0);
    expect(view.rightM[2]).toBeCloseTo(0);

    expect(view.upM[0]).toBeCloseTo(0);
    expect(view.upM[1]).toBeCloseTo(0);
    expect(view.upM[2]).toBeCloseTo(1);

    // Handedness: rightM × upM must point from the target toward the eye —
    // this is the assertion that catches a mirrored (det -1) basis.
    const eyeDir: Vec3 = [
      view.eyeM[0] - view.targetM[0],
      view.eyeM[1] - view.targetM[1],
      view.eyeM[2] - view.targetM[2],
    ];
    const eyeLen = Math.hypot(eyeDir[0], eyeDir[1], eyeDir[2]);
    const cross: Vec3 = [
      view.rightM[1] * view.upM[2] - view.rightM[2] * view.upM[1],
      view.rightM[2] * view.upM[0] - view.rightM[0] * view.upM[2],
      view.rightM[0] * view.upM[1] - view.rightM[1] * view.upM[0],
    ];
    expect(cross[0]).toBeCloseTo(eyeDir[0] / eyeLen);
    expect(cross[1]).toBeCloseTo(eyeDir[1] / eyeLen);
    expect(cross[2]).toBeCloseTo(eyeDir[2] / eyeLen);
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

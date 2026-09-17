import { mat4, vec3 } from 'wgpu-matrix';
import { describe, expect, it } from 'vitest';

import { sceneCameraView } from '../../../../tools/scene-workbench/src/render/sceneCameraView';
import {
  SCENE_CAMERA_BYTES,
  writeSceneCamera,
} from '../../../../tools/scene-workbench/src/render/writeSceneCamera';

describe('CAMERA_PROJECTIONS.orthographic', () => {
  it('orthographic view looks exactly down -Z', () => {
    const view = sceneCameraView(
      {
        yaw: 0.7,
        pitch: 0.35,
        distanceM: 80,
        targetM: [12.5, -4.25, 3],
        projection: 'orthographic',
      },
      [800, 600],
    );

    expect(view.eyeM[0] - view.targetM[0]).toBe(0);
    expect(view.eyeM[1] - view.targetM[1]).toBe(0);
    expect(view.eyeM[2] - view.targetM[2]).toBe(1000);
  });

  it('orthographic right matches perspective right at the same yaw', () => {
    const pose = { yaw: 2.1, pitch: 0.5, distanceM: 40 };
    const ortho = sceneCameraView(
      { ...pose, targetM: [0, 0, 0], projection: 'orthographic' },
      [800, 600],
    );
    const persp = sceneCameraView(
      { ...pose, targetM: [0, 0, 0], projection: 'perspective' },
      [800, 600],
    );

    for (let i = 0; i < 3; i++) expect(ortho.rightM[i]).toBeCloseTo(persp.rightM[i]!, 9);
  });

  it('orthographic screen corner unprojects to target ± halfHeight·aspect', () => {
    const view = sceneCameraView(
      { yaw: 0.4, pitch: 0.2, distanceM: 60, targetM: [3, -7, 2], projection: 'orthographic' },
      [1600, 900],
    );
    const out = new Float32Array(SCENE_CAMERA_BYTES / 4);
    writeSceneCamera(out, view, 1, 1, 1);

    const inverse = mat4.inverse(out.subarray(0, 16));
    const world = vec3.transformMat4([1, 1, 0.5], inverse);

    const h = 60 * Math.tan(Math.PI / 8);
    const w = h * (16 / 9);
    for (let i = 0; i < 2; i++) {
      const expected = view.targetM[i]! + view.rightM[i]! * w + view.upM[i]! * h;
      expect(world[i]).toBeCloseTo(expected, 3);
    }
  });
});

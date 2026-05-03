import { describe, it, expect } from 'vitest';
import { vec4 } from 'gl-matrix';
import { createOrbitCamera, computeViewProj } from '../../../src/services/camera/orbitCamera';

describe('orbit camera', () => {
  it('places the camera at +z when yaw=0 pitch=0', () => {
    const cam = createOrbitCamera({
      target: [0, 0, 0],
      distance: 10,
      yaw: 0,
      pitch: 0,
      fovYRad: Math.PI / 4,
      aspect: 1,
      near: 0.1,
      far: 100,
    });
    expect(cam.position[2]).toBeCloseTo(10, 5);
    expect(cam.position[0]).toBeCloseTo(0, 5);
    expect(cam.position[1]).toBeCloseTo(0, 5);
  });

  it('projects target near clip-space origin', () => {
    const cam = createOrbitCamera({
      target: [0, 0, 0],
      distance: 10,
      yaw: 0,
      pitch: 0,
      fovYRad: Math.PI / 4,
      aspect: 1,
      near: 0.1,
      far: 100,
    });
    const vp = computeViewProj(cam);
    const p = vec4.fromValues(0, 0, 0, 1);
    vec4.transformMat4(p, p, vp);
    expect(Math.abs(p[0] / p[3])).toBeLessThan(1e-5);
    expect(Math.abs(p[1] / p[3])).toBeLessThan(1e-5);
  });
});

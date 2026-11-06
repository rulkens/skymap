import { describe, expect, it } from 'vitest';
import { mat4 } from 'wgpu-matrix';
import { frustumPlanesFromViewProj } from '../../../../src/utils/camera/frustum/frustumPlanesFromViewProj';
import { sphereInAnyFrustum } from '../../../../src/utils/camera/frustum/sphereInAnyFrustum';

// A square view from the origin along `dir`, near 0.01, far 1000.
function viewPlanes(dir: [number, number, number], fovDeg = 10): Float32Array {
  const vp = mat4.multiply(
    mat4.perspective((fovDeg * Math.PI) / 180, 1, 0.01, 1000),
    mat4.lookAt([0, 0, 0], dir, [0, 0, 1]),
  );
  return frustumPlanesFromViewProj(vp);
}

describe('sphereInAnyFrustum', () => {
  const forward = viewPlanes([1, 0, 0]);

  it('keeps a sphere ahead and drops one beside the view', () => {
    expect(sphereInAnyFrustum(forward, 5, 0, 0, 0.01)).toBe(true);
    expect(sphereInAnyFrustum(forward, 5, 2, 0, 0.01)).toBe(false);
  });

  it('keeps a sphere whose radius reaches into the view', () => {
    // The edge at x = 5 sits ~0.44 off-axis; the centre is 0.66 off it.
    expect(sphereInAnyFrustum(forward, 5, 0.66 + 0.44, 0, 0.7)).toBe(true);
  });

  // Side planes alone nearly contain the axis at narrow FOV; the near plane does the work.
  it('drops a sphere behind the eye of a 0.5° view', () => {
    expect(sphereInAnyFrustum(viewPlanes([1, 0, 0], 0.5), -1, 0, 0, 0.4)).toBe(false);
  });

  it('keeps a sphere any one of several views sees', () => {
    const both = new Float32Array([...forward, ...viewPlanes([0, 1, 0])]);
    expect(sphereInAnyFrustum(both, 0, 5, 0, 0.01)).toBe(true);
    expect(sphereInAnyFrustum(both, -5, 0, 0, 0.01)).toBe(false);
  });

  it('culls nothing with no views', () => {
    expect(sphereInAnyFrustum(new Float32Array(0), -5, 0, 0, 0)).toBe(true);
  });
});

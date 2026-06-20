import { describe, it, expect } from 'vitest';
import { vec4 } from 'gl-matrix';
import { createOrbitCamera } from '../../../src/utils/camera/createOrbitCamera';
import { computeViewProj } from '../../../src/utils/camera/computeViewProj';

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

  it('roll=0 (default) produces the same matrix as no roll field', () => {
    // Sanity check: roll=0 must be a no-op and backward-compatible.
    const camNoRoll = createOrbitCamera({
      target: [0, 0, 0],
      distance: 10,
      yaw: 0,
      pitch: 0,
      fovYRad: Math.PI / 4,
      aspect: 1,
      near: 0.1,
      far: 100,
    });
    const camRoll0 = createOrbitCamera({
      target: [0, 0, 0],
      distance: 10,
      yaw: 0,
      pitch: 0,
      fovYRad: Math.PI / 4,
      aspect: 1,
      near: 0.1,
      far: 100,
      roll: 0,
    });
    const vpNoRoll = computeViewProj(camNoRoll);
    const vpRoll0 = computeViewProj(camRoll0);
    for (let i = 0; i < 16; i++) {
      expect(vpRoll0[i] as number).toBeCloseTo(vpNoRoll[i] as number, 6);
    }
  });

  it('roll=π/2 rotates image right-basis to world +Y', () => {
    // With yaw=0, pitch=0 the camera sits on the +Z axis looking at the origin.
    // The image-plane right vector (view matrix row 0, i.e. elements [0,4,8])
    // is normally world +X = (1, 0, 0).
    //
    // After a π/2 roll the image plane has rotated CCW by 90°, so the image
    // right direction should now align with world +Y = (0, 1, 0).
    //
    // This is the litmus test that Rodrigues rotation in computeViewProj
    // actually rotates the image plane.
    const cam = createOrbitCamera({
      target: [0, 0, 0],
      distance: 10,
      yaw: 0,
      pitch: 0,
      fovYRad: Math.PI / 4,
      aspect: 1,
      near: 0.1,
      far: 100,
      roll: Math.PI / 2,
    });
    const vp = computeViewProj(cam);

    // The view matrix is the upper-left 3×3 of the view part.  Since
    // computeViewProj returns proj*view we can instead transform unit
    // vectors and read off the camera-space coordinates.
    //
    // Strategy: transform world +X and world +Y into clip space without
    // the projection (use the view part only).  We reconstruct the view
    // matrix by calling lookAt directly with our rolled up-vector, then
    // check its row-0 (image-right) components.
    //
    // Simpler approach: verify that a point at world +Y and a point at
    // world +X project to the expected clip positions under the rolled VP.
    // At yaw=0,pitch=0 the unrolled right is world +X and the unrolled up
    // is world +Y.  After a 90° CCW roll: new right = world +Y, new up = −world +X.
    // So world +Y should project to the right edge of the screen (positive
    // NDC x), and world +X should project near the bottom (negative NDC y).

    // Project a point along world +Y, close to target
    const pY = vec4.fromValues(0, 1, 0, 1); // world +Y unit point
    vec4.transformMat4(pY, pY, vp);
    const ndcXy = pY[0] / pY[3];

    // Project a point along world +X, close to target
    const pX = vec4.fromValues(1, 0, 0, 1); // world +X unit point
    vec4.transformMat4(pX, pX, vp);
    const ndcYx = pX[1] / pX[3];

    // After 90° CCW roll: +Y maps to screen-right (positive ndc x)
    expect(ndcXy).toBeGreaterThan(0);
    // After 90° CCW roll: +X maps to screen-bottom (negative ndc y)
    expect(ndcYx).toBeLessThan(0);
  });
});

/**
 * updatePosition tests — placing the orbit eye from spherical state, with and
 * without an orientation frame.
 *
 * The no-basis cases pin the pre-feature contract: position = target +
 * distance·yawPitchToDir(yaw, pitch), with local +Y as the pole. The frame case
 * proves `poseBasis` is actually composed over the decode AND that the MIDDLE
 * column is the pole: with `ORIENTATION_FRAMES.equatorial` (whose pole is world
 * +z), a local-pole pose (pitch=+π/2) must land the eye along +z, not +y. If the
 * basis were ignored, or the wrong column read as the pole, the eye would sit on
 * +y and the assertion fails.
 */

import { describe, it, expect } from 'vitest';
import { updatePosition } from '../../../src/utils/camera/updatePosition';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import type { OrbitCamera } from '../../../src/@types/camera/OrbitCamera';

function makeCam(overrides: Partial<OrbitCamera> = {}): OrbitCamera {
  return {
    target: [0, 0, 0],
    distance: 10,
    yaw: 0,
    pitch: 0,
    fovYRad: Math.PI / 4,
    aspect: 1,
    near: 0.1,
    far: 1000,
    position: [0, 0, 0],
    ...overrides,
  };
}

describe('updatePosition', () => {
  it('with no frame, a local-pole pose puts the eye along +Y', () => {
    const cam = makeCam({ yaw: 0, pitch: Math.PI / 2, distance: 10, target: [1, 2, 3] });
    updatePosition(cam);
    expect(cam.position[0]).toBeCloseTo(1, 6);
    expect(cam.position[1]).toBeCloseTo(12, 6);
    expect(cam.position[2]).toBeCloseTo(3, 6);
  });

  it('a non-identity poseBasis rotates the derived position into the frame', () => {
    // Equatorial frame: pole (middle column) is world +z. A pose at yaw=0,
    // pitch=π/2 aims straight up the frame's local pole, so the world eye must
    // be along +z — NOT +y (which would mean the basis was never applied).
    const cam = makeCam({
      yaw: 0,
      pitch: Math.PI / 2,
      distance: 10,
      target: [0, 0, 0],
      poseBasis: ORIENTATION_FRAMES.equatorial,
    });
    updatePosition(cam);
    expect(cam.position[0]).toBeCloseTo(0, 6);
    expect(cam.position[1]).toBeCloseTo(0, 6);
    expect(cam.position[2]).toBeCloseTo(10, 6);
  });
});

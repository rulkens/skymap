import { describe, it, expect } from 'vitest';
import { vec3 } from 'gl-matrix';
import { createOrbitCamera } from '../../../src/services/camera/orbitCamera';
import { advanceCameraTween, type CameraTween } from '../../../src/services/camera/cameraTween';

function makeCam() {
  return createOrbitCamera({
    target: [0, 0, 0],
    distance: 100,
    yaw: 0,
    pitch: 0,
    fovYRad: Math.PI / 4,
    aspect: 1,
    near: 1,
    far: 1000,
  });
}

function makeTween(startMs: number, durationMs: number): CameraTween {
  return {
    startMs,
    durationMs,
    fromTarget: vec3.fromValues(0, 0, 0),
    toTarget: vec3.fromValues(10, 0, 0),
    fromDistance: 100,
    toDistance: 50,
    fromYaw: 0,
    toYaw: 0,
    fromPitch: 0,
    toPitch: 0,
  };
}

describe('advanceCameraTween', () => {
  it('at t=0 leaves the camera on the FROM state and reports not finished', () => {
    const cam = makeCam();
    const tween = makeTween(1000, 600);
    const finished = advanceCameraTween(cam, tween, 1000);
    expect(finished).toBe(false);
    expect(cam.target[0]).toBeCloseTo(0, 6);
    expect(cam.distance).toBeCloseTo(100, 6);
  });

  it('at t=1 snaps exactly to the TO state and reports finished', () => {
    const cam = makeCam();
    const tween = makeTween(1000, 600);
    const finished = advanceCameraTween(cam, tween, 1600);
    expect(finished).toBe(true);
    expect(cam.target[0]).toBeCloseTo(10, 6);
    expect(cam.distance).toBeCloseTo(50, 6);
  });

  it('past the deadline still snaps to TO (never overshoots) and reports finished', () => {
    const cam = makeCam();
    const tween = makeTween(1000, 600);
    const finished = advanceCameraTween(cam, tween, 9999);
    expect(finished).toBe(true);
    expect(cam.target[0]).toBeCloseTo(10, 6);
    expect(cam.distance).toBeCloseTo(50, 6);
  });

  it('mid-tween distance and target are between FROM and TO', () => {
    const cam = makeCam();
    const tween = makeTween(1000, 600);
    advanceCameraTween(cam, tween, 1300); // halfway in wall-clock time
    // easeOutCubic(0.5) = 0.875, so we expect roughly 87.5% of the way.
    expect(cam.target[0]).toBeGreaterThan(8);
    expect(cam.target[0]).toBeLessThan(9);
    expect(cam.distance).toBeLessThan(60);
    expect(cam.distance).toBeGreaterThan(50);
  });

  it('updates cam.position (calls updatePosition under the hood)', () => {
    const cam = makeCam();
    // After construction, position is [0, 0, 100] (yaw=pitch=0 → +Z axis).
    expect(cam.position[2]).toBeCloseTo(100, 5);
    const tween = makeTween(1000, 600);
    advanceCameraTween(cam, tween, 1600); // finish
    // target moved to [10, 0, 0], distance shrank to 50, yaw=pitch=0 still.
    // dir = [0, 0, 1] still, so position = target + 50*dir = [10, 0, 50].
    expect(cam.position[0]).toBeCloseTo(10, 5);
    expect(cam.position[2]).toBeCloseTo(50, 5);
  });
});

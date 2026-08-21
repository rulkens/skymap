/**
 * zoomedPose — unit tests for applying a `ZoomStep` to a resting pose.
 *
 * What can actually break here: the lateral half of a zoom-to-cursor tick
 * getting dropped on the way through (leaving a centred zoom), and the returned
 * target aliasing the input pose's (frozen, store-owned) array.
 */

import { describe, it, expect } from 'vitest';

import { zoomedPose } from '../../../src/utils/camera/zoomedPose';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { ZoomStep } from '../../../src/@types/camera/ZoomStep';

const makePose = (distance: number): CameraPose => ({
  target: [1, 2, 3],
  yaw: 0.5,
  pitch: -0.3,
  distance,
});

const zoom = (distanceScale: number, lateralMpc: [number, number, number]): ZoomStep => ({
  distanceScale,
  lateralMpc,
});

describe('zoomedPose', () => {
  it('scales distance and shifts the pivot by the step’s lateral, leaving yaw/pitch alone', () => {
    const result = zoomedPose(makePose(100), zoom(0.5, [10, -20, 30]));
    expect(result.distance).toBe(50);
    expect(result.target).toEqual([11, -18, 33]);
    expect(result.yaw).toBe(0.5);
    expect(result.pitch).toBe(-0.3);
  });

  it('returns a fresh target array — not the input pose’s', () => {
    const base = makePose(100);
    const result = zoomedPose(base, zoom(2, [0, 0, 0]));
    expect(result.target).not.toBe(base.target);
  });
});

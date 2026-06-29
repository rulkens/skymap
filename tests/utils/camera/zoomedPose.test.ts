/**
 * zoomedPose — unit tests for the wheel-zoom pose computation.
 *
 * Confirms distance scales by the factor and clamps to the shared envelope,
 * that orientation (target/yaw/pitch) carries over, and that the returned
 * target is a fresh array (no aliasing of the input pose's array).
 */

import { describe, it, expect } from 'vitest';

import { zoomedPose } from '../../../src/utils/camera/zoomedPose';
import { MIN_DISTANCE_MPC, MAX_DISTANCE_MPC } from '../../../src/utils/camera/clampDistance';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';

const makePose = (distance: number): CameraPose => ({
  target: [1, 2, 3],
  yaw: 0.5,
  pitch: -0.3,
  distance,
});

describe('zoomedPose', () => {
  it('scales distance by the factor', () => {
    const result = zoomedPose(makePose(100), 2);
    expect(result.distance).toBe(200);
  });

  it('zooming in (factor < 1) reduces distance', () => {
    const result = zoomedPose(makePose(100), 0.5);
    expect(result.distance).toBe(50);
  });

  it('clamps to the maximum distance', () => {
    const result = zoomedPose(makePose(MAX_DISTANCE_MPC), 1000);
    expect(result.distance).toBe(MAX_DISTANCE_MPC);
  });

  it('clamps to the minimum distance', () => {
    const result = zoomedPose(makePose(MIN_DISTANCE_MPC), 0.0001);
    expect(result.distance).toBe(MIN_DISTANCE_MPC);
  });

  it('carries target, yaw, and pitch over unchanged', () => {
    const result = zoomedPose(makePose(100), 2);
    expect(result.target).toEqual([1, 2, 3]);
    expect(result.yaw).toBe(0.5);
    expect(result.pitch).toBe(-0.3);
  });

  it('returns a fresh target array — not the input pose’s', () => {
    const base = makePose(100);
    const result = zoomedPose(base, 2);
    expect(result.target).not.toBe(base.target);
  });
});

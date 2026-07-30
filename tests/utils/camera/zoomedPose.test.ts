/**
 * zoomedPose — unit tests for the wheel-zoom pose computation.
 *
 * Confirms distance scales by the factor and clamps to the shared envelope,
 * that the pivot radius reaches the clamp (so a zoom on a resting or spun pose
 * pinned to a body still stops at its surface), that orientation
 * (target/yaw/pitch) carries over, and that the returned target is a fresh array
 * (no aliasing of the input pose's array).
 */

import { describe, it, expect } from 'vitest';

import { zoomedPose } from '../../../src/utils/camera/zoomedPose';
import { MIN_DISTANCE_MPC, MAX_DISTANCE_MPC } from '../../../src/utils/camera/clampDistance';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';

const makePose = (distance: number): CameraPose => ({
  target: [1, 2, 3],
  yaw: 0.5,
  pitch: -0.3,
  distance,
});

/** Earth's mean radius (km → Mpc). */
const EARTH_RADIUS_MPC = 6371 * SCALE_UNITS.KM_TO_MPC;

describe('zoomedPose', () => {
  it('scales distance by the factor', () => {
    const result = zoomedPose(makePose(100), 2, null);
    expect(result.distance).toBe(200);
  });

  it('zooming in (factor < 1) reduces distance', () => {
    const result = zoomedPose(makePose(100), 0.5, null);
    expect(result.distance).toBe(50);
  });

  it('clamps to the maximum distance', () => {
    const result = zoomedPose(makePose(MAX_DISTANCE_MPC), 1000, null);
    expect(result.distance).toBe(MAX_DISTANCE_MPC);
  });

  it('clamps to the minimum distance', () => {
    const result = zoomedPose(makePose(MIN_DISTANCE_MPC), 0.0001, null);
    expect(result.distance).toBe(MIN_DISTANCE_MPC);
  });

  it('floors at a pivoted body’s surface rather than the absolute minimum', () => {
    // The frame loop pins a resting / auto-rotating pose to the focused body, so
    // the zoom it applies has to floor off that body's surface too — the radius
    // must reach the clamp, not be dropped on the way through.
    const result = zoomedPose(makePose(EARTH_RADIUS_MPC * 4), 1e-6, EARTH_RADIUS_MPC);
    const radii = result.distance / EARTH_RADIUS_MPC;
    expect(radii).toBeGreaterThan(1);
    expect(radii).toBeLessThan(1.05);
  });

  it('carries target, yaw, and pitch over unchanged', () => {
    const result = zoomedPose(makePose(100), 2, null);
    expect(result.target).toEqual([1, 2, 3]);
    expect(result.yaw).toBe(0.5);
    expect(result.pitch).toBe(-0.3);
  });

  it('returns a fresh target array — not the input pose’s', () => {
    const base = makePose(100);
    const result = zoomedPose(base, 2, null);
    expect(result.target).not.toBe(base.target);
  });
});

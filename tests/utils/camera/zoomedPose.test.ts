/**
 * zoomedPose — unit tests for applying a `ZoomStep` to a resting pose.
 *
 * What can actually break here: the lateral half of a zoom-to-cursor tick
 * getting dropped on the way through (leaving a centred zoom), the pivot radius
 * not reaching the backstop clamp, and the returned target aliasing the input
 * pose's (frozen, store-owned) array.
 */

import { describe, it, expect } from 'vitest';

import { zoomedPose } from '../../../src/utils/camera/zoomedPose';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
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

/** Earth's mean radius (km → Mpc). */
const EARTH_RADIUS_MPC = 6371 * SCALE_UNITS.KM_TO_MPC;

describe('zoomedPose', () => {
  it('scales distance and shifts the pivot by the step’s lateral, leaving yaw/pitch alone', () => {
    const result = zoomedPose(makePose(100), zoom(0.5, [10, -20, 30]), null);
    expect(result.distance).toBe(50);
    expect(result.target).toEqual([11, -18, 33]);
    expect(result.yaw).toBe(0.5);
    expect(result.pitch).toBe(-0.3);
  });

  it('floors at a pivoted body’s surface rather than the absolute minimum', () => {
    // The frame loop pins a resting / auto-rotating pose to the focused body, so
    // the backstop clamp has to see that body's radius — dropping it on the way
    // through would leave only the 309 km absolute floor, deep inside Earth.
    const result = zoomedPose(
      makePose(EARTH_RADIUS_MPC * 4),
      zoom(1e-6, [0, 0, 0]),
      EARTH_RADIUS_MPC,
    );
    const radii = result.distance / EARTH_RADIUS_MPC;
    expect(radii).toBeGreaterThan(1);
    expect(radii).toBeLessThan(1.05);
  });

  it('returns a fresh target array — not the input pose’s', () => {
    const base = makePose(100);
    const result = zoomedPose(base, zoom(2, [0, 0, 0]), null);
    expect(result.target).not.toBe(base.target);
  });
});

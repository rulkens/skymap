/**
 * earthSurfaceFraming — unit tests for the fly-to-Earth framing helper.
 *
 * The helper is the pure core of the descent tween: given Earth's seed it
 * returns the `{ target, distance }` that parks the camera a few Earth-radii
 * off the surface. The two things worth pinning: the target is a distinct copy
 * of Earth's position (never an alias of the body record), and the distance is
 * surface-scale — a small multiple of Earth's radius in Mpc, not a galaxy-scale
 * number.
 */

import { describe, it, expect } from 'vitest';

import { earthSurfaceFraming } from '../../../src/utils/camera/earthSurfaceFraming';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

describe('earthSurfaceFraming', () => {
  it("earthSurfaceFraming targets Earth's position", () => {
    const { target } = earthSurfaceFraming(SCENE_EARTH.positionMpc, SCENE_EARTH.radiusKm);
    expect(target).toEqual(SCENE_EARTH.positionMpc);
    // A fresh array, not the body record's own — mutating the result must not
    // reach back into the seed.
    expect(target).not.toBe(SCENE_EARTH.positionMpc);
  });

  it("earthSurfaceFraming distance is a small multiple of Earth's radius in Mpc", () => {
    const { distance } = earthSurfaceFraming(SCENE_EARTH.positionMpc, SCENE_EARTH.radiusKm);
    const radiusMpc = SCENE_EARTH.radiusKm * SCALE_UNITS.KM_TO_MPC;
    // Surface-scale, not galaxy-scale: a couple-to-a-few Earth radii back.
    expect(distance).toBeGreaterThanOrEqual(2 * radiusMpc);
    expect(distance).toBeLessThanOrEqual(4 * radiusMpc);
  });
});

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
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';

// Earth's framing position comes from the derived J2000 snapshot (radius is
// authored identity off the record) — the same pair the fly-to saga passes.
const EARTH_POS = deriveBodyStates(CONST_J2000).get('earth')!.positionMpc;

describe('earthSurfaceFraming', () => {
  it("earthSurfaceFraming targets Earth's position", () => {
    const { target } = earthSurfaceFraming(EARTH_POS, SCENE_EARTH.radiusKm);
    expect(target).toEqual(EARTH_POS);
    // A fresh array, not the derived state's own — mutating the result must not
    // reach back into the snapshot.
    expect(target).not.toBe(EARTH_POS);
  });

  it("earthSurfaceFraming distance is a small multiple of Earth's radius in Mpc", () => {
    const { distance } = earthSurfaceFraming(EARTH_POS, SCENE_EARTH.radiusKm);
    const radiusMpc = SCENE_EARTH.radiusKm * SCALE_UNITS.KM_TO_MPC;
    // Surface-scale, not galaxy-scale: a couple-to-a-few Earth radii back.
    expect(distance).toBeGreaterThanOrEqual(2 * radiusMpc);
    expect(distance).toBeLessThanOrEqual(4 * radiusMpc);
  });
});

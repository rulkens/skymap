/**
 * liveWorldPose — the single off-frame world-arm resolution site.
 *
 * The one property worth pinning is the EPOCH: a body arm stores the eye in the
 * body's own axes, so where it lands in Mpc depends entirely on which instant
 * the body is derived at. Reading a fresh clock instead of the last RENDERED
 * instant would unweld a pick (or a gesture seed) from the pixels on screen.
 */

import { describe, it, expect } from 'vitest';

import { liveWorldPose } from '../../../../src/services/engine/helpers/liveWorldPose';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FramedCameraPose } from '../../../../src/@types/camera/FramedCameraPose';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// The epoch the "last frame" drew at, and where the clock has since moved to —
// a month apart, so Earth has travelled ~1e4 body radii between them.
const RENDERED_SIM_DAYS = CONST_J2000 + 3652.5;
const MOVED_ON_SIM_DAYS = RENDERED_SIM_DAYS + 30;

// An eye 1000 km above the body's +x axis looking straight down at it: forward
// is −x, so the screen-centre ray hits the surface at local [R, 0, 0] and the
// resolved target must sit exactly one body radius from the body's centre.
const ALTITUDE_M = 1e6;
const EARTH_ARM: FramedCameraPose = {
  frame: { body: SCENE_EARTH.id as BodyId },
  pose: {
    bodyId: SCENE_EARTH.id as BodyId,
    anchorLocalM: [0, 0, 0],
    eyeRelAnchorM: [SCENE_EARTH.radiusM + ALTITUDE_M, 0, 0],
    // right | up | forward as columns: right × up = forward = −x.
    basisLocal: [0, 0, 1, 0, 1, 0, -1, 0, 0],
  },
};

function makeState(): EngineState {
  return {
    settings: { orientation: 'ecliptic' },
    cameraRuntime: {
      lastPose: { current: EARTH_ARM },
      displayedPose: { current: EARTH_ARM },
      lastRenderedSimDays: { current: RENDERED_SIM_DAYS },
      upBasis: { current: ORIENTATION_FRAMES.ecliptic },
    },
  } as unknown as EngineState;
}

function distanceMpc(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

describe('liveWorldPose', () => {
  it('resolves a body arm at the last RENDERED sim epoch, not the current one', () => {
    const radiusMpc = SCENE_EARTH.radiusM * SCALE_UNITS.M_TO_MPC;
    const earthRendered = deriveBodyStates(RENDERED_SIM_DAYS).get(SCENE_EARTH.id)!;
    const earthMovedOn = deriveBodyStates(MOVED_ON_SIM_DAYS).get(SCENE_EARTH.id)!;
    // Precondition: the two epochs put Earth somewhere genuinely different.
    expect(distanceMpc(earthRendered.positionMpc, earthMovedOn.positionMpc)).toBeGreaterThan(
      1000 * radiusMpc,
    );
    // The memo now holds the LATER instant — the exact trap a fresh clock read
    // would fall into.

    const world = liveWorldPose(makeState());

    // The screen-centre point sits on the rendered epoch's Earth…
    expect(distanceMpc(world.target, earthRendered.positionMpc)).toBeCloseTo(radiusMpc, 12);
    // …and nowhere near where the clock has since moved it.
    expect(distanceMpc(world.target, earthMovedOn.positionMpc)).toBeGreaterThan(1000 * radiusMpc);
    // The range is the altitude, not altitude + 2R: the conversion took the
    // NEAR root. Compared as a ratio — at ~3e-17 Mpc an absolute tolerance
    // would pass on any value at all.
    expect(world.distance / (ALTITUDE_M * SCALE_UNITS.M_TO_MPC)).toBeCloseTo(1, 9);
  });
});

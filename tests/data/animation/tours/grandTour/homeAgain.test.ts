/**
 * Home again ends on Earth's arm: on the settle the tour restores the viewer's
 * clock, and only a body-framed camera rides Earth to where the clock puts it.
 * Above the arm's release height the camera falls back to the world arm and is
 * left where Earth stood on the tour date.
 */
import { describe, it, expect } from 'vitest';

import { homeAgain } from '../../../../../src/data/animation/tours/grandTour/homeAgain';
import { SONDERMARKEN_SPOT } from '../../../../../src/data/animation/tours/grandTour/sondermarkenSpot';
import { TOUR_NIGHT_SIM_DAYS } from '../../../../../src/data/animation/tours/grandTour/tourNightSimDays';
import { DEFAULT_CAMERA_TUNING } from '../../../../../src/data/camera/cameraTuning';
import { EARTH_DATUM_RADIUS_M } from '../../../../../src/data/bodies/earthDatumRadiusM';
import { ORIENTATION_FRAMES } from '../../../../../src/data/orientation/orientationFrames';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { resolveClipFoci } from '../../../../../src/services/engine/animation/resolveClipFoci';
import { compileClip } from '../../../../../src/services/engine/animation/compileClip';
import { evaluateFramedClip } from '../../../../../src/services/engine/camera/clips/evaluateClip';
import { resolveClipStart } from '../../../../../src/state/camera/cameraSlice';
import { yawPitchToDir } from '../../../../../src/utils/camera/orbitPose/yawPitchToDir';
import { skySpotRadial } from '../../../../../src/utils/geo/skySpotRadial';
import { dot3 } from '../../../../../src/utils/math/dot3';
import { normalize3 } from '../../../../../src/utils/math/normalize3';
import { selectionResolverOver } from '../../../../support/selectionResolverOver';
import { installAppSelectionKinds } from '../../../../support/installAppSelectionKinds';
import type { CameraPose } from '../../../../../src/@types/camera/pose/CameraPose';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

installAppSelectionKinds();

const RESOLVER = selectionResolverOver({ byId: () => null, byCategory: () => [] });
const BASIS = ORIENTATION_FRAMES.galactic;
// The edge beat's pose: the whole observable universe in frame.
const EDGE: CameraPose = { target: [0, 0, 0], yaw: 0.3, pitch: 0.2, distance: 29229, roll: 0 };

describe('Home again', () => {
  it('lands on Earth’s arm, over Copenhagen, below the release height', () => {
    const resolved = resolveClipFoci(homeAgain, RESOLVER, 1, EDGE, TOUR_NIGHT_SIM_DAYS, BASIS);
    const { frame, channels } = evaluateFramedClip(
      resolveClipStart(resolved, EDGE),
      compileClip(resolved).durationSec,
      { bodies: deriveBodyStates(TOUR_NIGHT_SIM_DAYS), frameBasis: BASIS, playback: {} },
    );
    expect(frame).toEqual({ body: SONDERMARKEN_SPOT.body });

    const arm = yawPitchToDir(channels.yaw, channels.pitch);
    const eyeM = [0, 1, 2].map((i) => channels.target[i]! + arm[i]! * channels.distance) as Vec3;
    expect(dot3(normalize3(eyeM), skySpotRadial(SONDERMARKEN_SPOT))).toBeCloseTo(1, 6);
    const heightOverRadius = Math.hypot(...eyeM) / EARTH_DATUM_RADIUS_M - 1;
    expect(heightOverRadius).toBeLessThan(DEFAULT_CAMERA_TUNING.disengageHR);
  });
});

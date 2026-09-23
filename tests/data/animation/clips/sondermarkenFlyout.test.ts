/**
 * sondermarkenFlyout — the opening eye must hang ABOVE the park, not below
 * the ground or over the wrong hemisphere: a sign slip in the look direction or
 * a skipped frame rotation both leave the pose plausible-looking but wrong.
 */

import { describe, it, expect } from 'vitest';
import { sondermarkenFlyout } from '../../../../src/data/animation/clips/sondermarkenFlyout';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { yawPitchToDir } from '../../../../src/utils/camera/yawPitchToDir';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import { surfacePointBodyFixed } from '../../../../src/utils/geo/surfacePointBodyFixed';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { EARTH_PLACES } from '../../../../src/data/palette/earthPlaces';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';

describe('sondermarkenFlyout', () => {
  it('opens with the eye at the preset altitude straight above the park', () => {
    const simDays = CONST_J2000 + 123.4;
    const start = sondermarkenFlyout(simDays).data.start as CameraPose;
    const earth = deriveBodyStates(simDays).get('earth')!;
    const place = EARTH_PLACES.find((p) => p.id === 'sondermarken')!;

    const dir = rotateVec3ByTightMat3(
      yawPitchToDir(start.yaw, start.pitch),
      ORIENTATION_FRAMES.ecliptic,
    );
    const eyeFromCentreM = [0, 1, 2].map(
      (i) =>
        (start.target[i]! + start.distance * dir[i]! - earth.positionMpc[i]!) /
        SCALE_UNITS.M_TO_MPC,
    );
    const r = Math.hypot(...eyeFromCentreM);
    expect(r - SCENE_EARTH.surface.datumRadiusM).toBeCloseTo(place.altKm * 1000, -1);

    const up = rotateVec3ByTightMat3(
      surfacePointBodyFixed(place.latDeg, place.lonDeg, 1),
      earth.orientation,
    );
    for (let i = 0; i < 3; i++) expect(eyeFromCentreM[i]! / r).toBeCloseTo(up[i]!, 6);
  });
});

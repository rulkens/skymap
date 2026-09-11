/**
 * Earth's body arm at J2000: eye `radii` Earth-radii from the centre, looking at
 * it. The replay fixtures seed a body-arm base from this.
 */

import { deriveBodyStates } from '../../src/services/engine/frame/deriveBodyStates';
import { toBodyArm } from '../../src/services/engine/camera/poseFrameConversion';
import { SCALE_UNITS } from '../../src/data/scaleUnits';
import { CONST_J2000 } from '../../src/data/time/constJ2000';
import { ORIENTATION_FRAMES } from '../../src/data/orientation/orientationFrames';
import type { Vec3 } from '../../src/@types/math/Vec3';
import type { FramedCameraPose } from '../../src/@types/camera/FramedCameraPose';

export function earthArm(radii: number): FramedCameraPose {
  const earth = deriveBodyStates(CONST_J2000).get('earth')!;
  const B = ORIENTATION_FRAMES.ecliptic;
  return {
    frame: { body: 'earth' },
    pose: toBodyArm(
      {
        target: [...earth.positionMpc] as Vec3,
        yaw: 0.7,
        pitch: 0.3,
        distance: radii * 6371000 * SCALE_UNITS.M_TO_MPC,
      },
      B,
      B,
      'earth',
      earth,
    ),
  } as FramedCameraPose;
}

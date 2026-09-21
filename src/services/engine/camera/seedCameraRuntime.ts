/**
 * seedCameraRuntime — the ONE constructor of `CameraRuntime`: the engine's
 * boot placeholder and `wireInput`'s first real pose both come through here, so
 * no seed site can leave a half-built bag. Displayed = authored at the seed:
 * nothing has been projected yet (`projectFramePose` splits them thereafter).
 * A caller dispatches first, then seeds, so the runtime starts reconciled.
 */

import type { CameraProjection } from '../../../@types/camera/CameraProjection';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { CameraRuntime } from '../../../@types/engine/state/CameraRuntime';
import type { RootState } from '../../../store/types';
import { UNSTARTED_EPOCHS } from './cameraEpochs';
import { frameKey } from './rungs/frameKey';
import { rowFor } from './rungs/rowFor';
import { EMPTY_TILT_MEMORY } from '../../../data/camera/emptyTiltMemory';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';
import { CONST_J2000 } from '../../../data/time/constJ2000';

export function seedCameraRuntime(args: {
  readonly state: RootState;
  readonly projection: CameraProjection;
}): CameraRuntime {
  const { camera, settings } = args.state;
  // Copied: the boot seed is the camera slice's `base`, and the register must
  // never alias the store's object.
  const pose: FramedCameraPose = { ...camera.base };
  return {
    register: { pose, winner: 'resting' },
    // BY IDENTITY (not a copy, unlike `pose` above): the loop compares this
    // against the store's `base` next frame to detect an outside commit.
    base: camera.base,
    orientation: settings.orientation,
    epochs: UNSTARTED_EPOCHS,
    follow: null,
    gesture: { key: frameKey(pose.frame), value: rowFor(pose.frame).emptyMemory },
    tilt: EMPTY_TILT_MEMORY,
    outputs: {
      displayed: pose,
      simDays: CONST_J2000,
      // Copied, so the seed never aliases the shared registry entry.
      upBasis: [...ORIENTATION_FRAMES[settings.orientation]],
      projection: args.projection,
    },
  };
}

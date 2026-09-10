/**
 * seedCameraRuntime — the ONE constructor of `CameraRuntime`: the engine's
 * boot placeholder and `wireInput`'s first real pose both come through here, so
 * no seed site can leave a half-built bag. Displayed = authored at the seed:
 * nothing has been projected yet (runFrame step 4 splits them thereafter).
 */

import type { CameraProjection } from '../../../@types/camera/CameraProjection';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { CameraRuntime } from '../../../@types/engine/state/CameraRuntime';
import { UNSTARTED_EPOCHS } from './cameraEpochs';
import { EMPTY_SURFACE_MEMORY } from '../../camera/surfaceStep';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../data/defaults';
import { CONST_J2000 } from '../../../data/time/constJ2000';

export function seedCameraRuntime(args: {
  readonly committed: FramedCameraPose;
  readonly projection: CameraProjection;
}): CameraRuntime {
  // Copied: the boot seed is the camera slice's `base`, and the register must
  // never alias the store's object.
  const pose: FramedCameraPose = { ...args.committed };
  return {
    register: { pose, winner: 'resting' },
    epochs: UNSTARTED_EPOCHS,
    follow: null,
    surface: EMPTY_SURFACE_MEMORY,
    outputs: {
      displayed: pose,
      simDays: CONST_J2000,
      // Copied, so the seed never aliases the shared registry entry.
      upBasis: [...ORIENTATION_FRAMES[DEFAULT_ORIENTATION]],
      projection: args.projection,
      lastZoomFactor: null,
    },
  };
}

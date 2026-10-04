/**
 * controlSchemes — the control-scheme registry. `stepCameraRuntime` resolves
 * the active scheme's driver table here, and the recognizer its press binding,
 * so a scheme is a row, not a branch in the frame loop.
 */

import type { ControlScheme } from '../../../@types/engine/camera/ControlScheme';
import type { ControlSchemeId } from '../../../@types/engine/camera/ControlSchemeId';
import { CAMERA_DRIVERS, OPENSPACE_DRIVERS } from './cameraDrivers';
import { openSpaceAxisFor } from '../../../utils/camera/openSpaceAxisFor';

export const CONTROL_SCHEMES: Readonly<Record<ControlSchemeId, ControlScheme>> = {
  skymap: { drivers: CAMERA_DRIVERS, bindAxis: () => null },
  openspace: { drivers: OPENSPACE_DRIVERS, bindAxis: openSpaceAxisFor },
};

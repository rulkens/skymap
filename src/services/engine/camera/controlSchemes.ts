/**
 * controlSchemes — the control-scheme registry. `runFrame` resolves the active
 * scheme's driver table here, so a second scheme is a new row, not a branch in
 * the frame loop.
 */

import type { ControlScheme } from '../../../@types/engine/camera/ControlScheme';
import type { ControlSchemeId } from '../../../@types/engine/camera/ControlSchemeId';
import { CAMERA_DRIVERS } from './cameraDrivers';

export const CONTROL_SCHEMES: Readonly<Record<ControlSchemeId, ControlScheme>> = {
  skymap: { drivers: CAMERA_DRIVERS },
};

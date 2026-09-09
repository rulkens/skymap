/**
 * activeDriverId — this frame's winner without producing the pose; the same
 * `pickWinner` as `runCameraDrivers`, so the epoch advance, the commit gate
 * and the produced pose can never disagree on who won.
 */

import type { CameraDriver } from '../../../@types/engine/camera/CameraDriver';
import type { RootState } from '../../../store/types';
import { pickWinner } from './cameraDrivers';

export function activeDriverId(drivers: readonly CameraDriver[], s: RootState): string {
  return pickWinner(drivers, s).id;
}

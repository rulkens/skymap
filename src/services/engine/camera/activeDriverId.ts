/**
 * activeDriverId — which driver wins this frame, without producing the pose.
 * Delegates to the same `pickWinner` as `runCameraDrivers`, so for the SAME
 * `drivers` and `s` the epoch advance, the commit-on-edge gate and the produced
 * pose can never disagree on the winner — no separate 'who won' bookkeeping.
 */

import type { CameraDriver } from '../../../@types/engine/camera/CameraDriver';
import type { RootState } from '../../../store/types';
import { pickWinner } from './cameraDrivers';

export function activeDriverId(drivers: readonly CameraDriver[], s: RootState): string {
  return pickWinner(drivers, s).id;
}

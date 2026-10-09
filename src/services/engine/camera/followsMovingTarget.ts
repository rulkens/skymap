import { CAMERA_DRIVERS } from './cameraDrivers';
import type { DriverId } from '../../../@types/engine/camera/DriverId';

/** Whether the row `id` re-asserts a moving target every frame; read from the row's own flag. */
export function followsMovingTarget(id: DriverId): boolean {
  return CAMERA_DRIVERS.find((d) => d.id === id)?.followsMovingTarget ?? false;
}

import { CAMERA_DRIVERS } from './cameraDrivers';
import type { DriverId } from '../../../@types/engine/camera/DriverId';

/** Whether the row `id` takes a wheel notch as its own distance target; read from the row's flag. */
export function ridesWheelTarget(id: DriverId): boolean {
  return CAMERA_DRIVERS.find((d) => d.id === id)?.ridesWheelTarget ?? false;
}

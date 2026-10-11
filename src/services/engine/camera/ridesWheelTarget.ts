import type { CameraDriver } from '../../../@types/engine/camera/CameraDriver';
import type { DriverId } from '../../../@types/engine/camera/DriverId';

/** Whether the row `id` takes a wheel notch as its own distance target; read from the row's flag. */
export function ridesWheelTarget(drivers: readonly CameraDriver[], id: DriverId): boolean {
  return drivers.find((d) => d.id === id)?.ridesWheelTarget ?? false;
}

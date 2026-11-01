import type { DriverId } from '../../@types/engine/camera/DriverId';

/** The navigator's two rows; the step's reset rule and the wheel's live-register read name them as one. */
export function isNavigatorDriverId(id: DriverId): boolean {
  return id === 'openSpaceHeld' || id === 'openSpaceCoast';
}

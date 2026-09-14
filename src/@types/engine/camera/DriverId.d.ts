/**
 * DriverId — the row names of the `cameraDrivers` table. Every "who won?"
 * comparison outside the table (`stepCameraRuntime`'s tween cancel, the wheel's
 * spin-preserving zoom, `isFollowDriverId`) spells one of these by literal, so
 * the union is what makes a renamed or mistyped row a compile error.
 */

export type DriverId =
  | 'clip'
  | 'orbitDrag'
  | 'followApproach'
  | 'followHold'
  | 'tween'
  | 'autoRotate'
  | 'resting';

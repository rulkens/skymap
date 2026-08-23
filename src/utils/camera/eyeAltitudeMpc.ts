/**
 * eyeAltitudeMpc — altitude of the camera EYE above a body's surface,
 * measured from the actual eye position rather than `cam.distance −
 * bodyRadiusMpc`.
 *
 * The distance-minus-radius shortcut only holds while the orbit `target`
 * sits exactly at the body's centre. It silently drifts wrong the moment a
 * pan strafes `target` away from centre (`followPanStored`) or a future
 * zoom-to-cursor lets the eye slide independently of the pivot — see
 * `earthCameraDistanceMpc` (`earthLayer.ts`) for the same eye-based pattern
 * already proven for Earth's own layer.
 */

import type { Vec3 } from '../../@types/math/Vec3';

export function eyeAltitudeMpc(
  eyePosMpc: Readonly<Vec3>,
  bodyCenterMpc: Readonly<Vec3>,
  bodyRadiusMpc: number,
): number {
  const dx = eyePosMpc[0] - bodyCenterMpc[0];
  const dy = eyePosMpc[1] - bodyCenterMpc[1];
  const dz = eyePosMpc[2] - bodyCenterMpc[2];
  return Math.hypot(dx, dy, dz) - bodyRadiusMpc;
}

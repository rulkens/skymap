/**
 * groundTrackingRadPerPixel — the orbit rotation per CSS pixel that sweeps the
 * ground under the cursor at the drag's own speed:
 *
 *     2 · tan(fovY/2) · h / (cssHeight · pivotRadiusMpc)
 *
 * the pan path's `pxToWorld` (`orbitControls.ts`) evaluated at EYE altitude `h`
 * (pan moves the TARGET, an orbit drag sweeps the GROUND), divided by the
 * radius to turn that world distance into radians of rotation.
 *
 * Uncapped, and EXACT for a grab at screen centre — measured against §4.4's
 * solve at ratio 1.000 over 0.001–200 body radii of altitude. Off centre the
 * exact solve needs more (perspective foreshortening), which is why
 * `surfaceDragRotation` measures its trust bound in units of this rate;
 * `orbitRadPerPixel` caps it for the flat-rate fallback.
 *
 * @param fovYRad         Vertical field of view, radians.
 * @param altitudeMpc     EYE-based altitude above the pivot's surface, Mpc.
 * @param cssHeight       Canvas CSS height, pixels.
 * @param pivotRadiusMpc  Orbit pivot's physical radius, Mpc.
 */

export function groundTrackingRadPerPixel(
  fovYRad: number,
  altitudeMpc: number,
  cssHeight: number,
  pivotRadiusMpc: number,
): number {
  return (2 * Math.tan(fovYRad / 2) * altitudeMpc) / (cssHeight * pivotRadiusMpc);
}

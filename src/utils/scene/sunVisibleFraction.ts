import type { Vec3 } from '../../@types/math/Vec3';
import { SCALE_UNITS } from '../../data/scaleUnits';

/**
 * sunVisibleFraction — fraction of the Sun's disc NOT occluded by the host
 * sphere, as seen from the body: 1 on the day side, 0 deep in umbra, ramping
 * **linearly** through the penumbra. No existing angular-overlap/eclipse-
 * fraction helper to build on (spec, "Umbra and Earthshine") — new,
 * self-contained. The true penumbra profile is the area-overlap integral of
 * two discs (neither linear nor smoothstep); at a 400 km orbit the whole
 * crossing takes about a second of sim time, so the cheaper linear ramp's
 * shape is not observable.
 */
export function sunVisibleFraction(input: {
  readonly bodyPosMpc: Readonly<Vec3>;
  readonly sunPosMpc: Readonly<Vec3>;
  readonly hostPosMpc: Readonly<Vec3>;
  readonly sunRadiusM: number;
  readonly hostRadiusM: number;
}): number {
  const { bodyPosMpc, sunPosMpc, hostPosMpc, sunRadiusM, hostRadiusM } = input;
  const sun = angularRadiusAndDirection(bodyPosMpc, sunPosMpc, sunRadiusM);
  const host = angularRadiusAndDirection(bodyPosMpc, hostPosMpc, hostRadiusM);
  const cosSeparation =
    sun.dir[0] * host.dir[0] + sun.dir[1] * host.dir[1] + sun.dir[2] * host.dir[2];
  const separationRad = Math.acos(Math.min(1, Math.max(-1, cosSeparation)));

  const lowThreshold = Math.abs(host.angRad - sun.angRad);
  const highThreshold = host.angRad + sun.angRad;
  if (separationRad <= lowThreshold && host.angRad >= sun.angRad) return 0;
  if (separationRad >= highThreshold) return 1;
  return (separationRad - lowThreshold) / (highThreshold - lowThreshold);
}

/** Angular radius (asin) and unit direction from the body toward `posMpc`. */
function angularRadiusAndDirection(
  bodyPosMpc: Readonly<Vec3>,
  posMpc: Readonly<Vec3>,
  radiusM: number,
): { angRad: number; dir: Vec3 } {
  const dx = posMpc[0] - bodyPosMpc[0];
  const dy = posMpc[1] - bodyPosMpc[1];
  const dz = posMpc[2] - bodyPosMpc[2];
  const distanceMpc = Math.hypot(dx, dy, dz);
  const distanceM = distanceMpc * SCALE_UNITS.MPC_TO_M;
  // Defensive clamp: the body can in principle sit inside the disc at absurd
  // test distances, not a real in-scene case, but the guard costs nothing.
  const angRad = Math.asin(Math.min(1, radiusM / distanceM));
  return { angRad, dir: [dx / distanceMpc, dy / distanceMpc, dz / distanceMpc] };
}

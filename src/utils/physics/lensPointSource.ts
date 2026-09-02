/**
 * lensPointSource — the images a Schwarzschild point mass makes of a point
 * source, thin-lens weak field (Schneider, Ehlers & Falco, point-mass lens).
 *
 * FINITE distances, not the at-infinity limit the lens pass's sky cubemap
 * carries: theta_E^2 = 2 r_s D_ls / (D_l D_s), D_l and D_s measured ALONG the
 * lens axis from the eye, D_ls = D_s - D_l, deflection constant 4GM/c^2 = 2 r_s.
 * Comparable source/observer distances put the at-infinity radius tens of
 * percent out. All lengths share one unit; angles come back in radians.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { LensedImage } from '../../@types/lensing/LensedImage';
import { normalize3 } from '../math/normalize3';
import { cross3 } from '../math/cross3';

const dot3 = (a: Readonly<Vec3>, b: Readonly<Vec3>): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** `cos(angle) * axis + sin(angle) * perp` — signed, so a negative angle lands on the far side. */
function tiltFromAxis(axis: Readonly<Vec3>, perp: Readonly<Vec3>, angleRad: number): Vec3 {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return [axis[0] * c + perp[0] * s, axis[1] * c + perp[1] * s, axis[2] * c + perp[2] * s];
}

/**
 * The image plane's reference direction: the source's offset from the axis,
 * normalised. Degenerate on-axis, where the true image is an Einstein RING and
 * every perpendicular is equally correct — any pick then samples that ring at
 * two antipodes, which is the best a two-image model can do.
 */
function offsetDirection(axis: Readonly<Vec3>, sourceDir: Readonly<Vec3>): Vec3 {
  const along = dot3(sourceDir, axis);
  const perp: Vec3 = [
    sourceDir[0] - axis[0] * along,
    sourceDir[1] - axis[1] * along,
    sourceDir[2] - axis[2] * along,
  ];
  if (Math.hypot(perp[0], perp[1], perp[2]) > 0) return normalize3(perp);
  // Cross with whichever basis vector the axis is least aligned to, so the
  // product is never near-zero.
  const least: Vec3 = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return normalize3(cross3(axis, least));
}

export function lensPointSource(input: {
  eye: Readonly<Vec3>;
  lens: Readonly<Vec3>;
  source: Readonly<Vec3>;
  schwarzschildRadius: number;
}): readonly LensedImage[] {
  const { eye, lens, source, schwarzschildRadius } = input;

  const toLens: Vec3 = [lens[0] - eye[0], lens[1] - eye[1], lens[2] - eye[2]];
  const toSource: Vec3 = [source[0] - eye[0], source[1] - eye[1], source[2] - eye[2]];
  const sourceDir = normalize3(toSource);

  const distLens = Math.hypot(toLens[0], toLens[1], toLens[2]);
  const axis = normalize3(toLens);
  const distSource = dot3(toSource, axis);

  // Nothing at or in front of the lens plane is deflected — the ray reaches the
  // eye before it passes the mass. Also the eye-on-the-lens degenerate case.
  if (distLens <= 0 || distSource <= distLens) {
    return [{ direction: sourceDir, magnification: 1 }];
  }

  const einsteinRad = Math.sqrt(
    (2 * schwarzschildRadius * (distSource - distLens)) / (distLens * distSource),
  );
  const betaRad = Math.acos(Math.min(1, Math.max(-1, dot3(sourceDir, axis))));
  const perp = offsetDirection(axis, sourceDir);

  // theta^2 - beta theta - theta_E^2 = 0: the primary on the source's side, the
  // secondary (negative root) on the far side of the axis, inside theta_E.
  const root = Math.sqrt(betaRad * betaRad + 4 * einsteinRad * einsteinRad);
  const magnificationAt = (thetaRad: number): number =>
    Math.abs(1 / (1 - (einsteinRad / thetaRad) ** 4));

  return [(betaRad + root) / 2, (betaRad - root) / 2].map((thetaRad) => ({
    direction: tiltFromAxis(axis, perp, thetaRad),
    magnification: magnificationAt(thetaRad),
  }));
}

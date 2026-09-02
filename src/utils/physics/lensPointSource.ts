/**
 * lensPointSource — the images a Schwarzschild point mass makes of a point
 * source: thin lens, but on the EXACT bending angle a caller-supplied sampler
 * carries, not the weak field's 2/b.
 *
 * FINITE distances, measured ALONG the lens axis from the eye: D_l, D_s,
 * D_ls = D_s - D_l. One length unit throughout; angles come back in radians.
 * Solves beta = theta - sign(theta) (D_ls/D_s) alpha(D_l |theta| / r_s) per side
 * by bisection. `deflection` MUST diverge at the photon sphere — that is what
 * makes each side's root unique and bounds the bracket from below.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { LensedImage } from '../../@types/lensing/LensedImage';
import { normalize3 } from '../math/normalize3';
import { cross3 } from '../math/cross3';
import { CRITICAL_IMPACT_PARAM_RS } from '../lensing/criticalImpactParamRs';

/** Halvings of the initial bracket — 2^-60 of it, past f64's reach on the root. */
const BISECTION_ITERATIONS = 60;
/** Doublings allowed while pushing the bracket's outer end past the root. */
const BRACKET_DOUBLINGS = 64;
/** Finite-difference step for dbeta/dtheta, as a fraction of the image angle. */
const DERIVATIVE_STEP = 1e-4;

const dot3 = (a: Readonly<Vec3>, b: Readonly<Vec3>): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** `cos(angle) * axis + sin(angle) * perp` — signed, so a negative angle lands on the far side. */
function tiltFromAxis(axis: Readonly<Vec3>, perp: Readonly<Vec3>, angleRad: number): Vec3 {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return [axis[0] * c + perp[0] * s, axis[1] * c + perp[1] * s, axis[2] * c + perp[2] * s];
}

/**
 * The image plane's reference direction, from the source's rejection off the
 * axis. Degenerate on-axis, where the true image is an Einstein RING and every
 * perpendicular is equally correct — any pick then samples that ring at two
 * antipodes, which is the best a two-image model can do.
 */
function offsetDirection(axis: Readonly<Vec3>, rejection: Readonly<Vec3>): Vec3 {
  if (Math.hypot(rejection[0], rejection[1], rejection[2]) > 0) return normalize3(rejection);
  // Cross with whichever basis vector the axis is least aligned to, so the
  // product is never near-zero.
  const least: Vec3 = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return normalize3(cross3(axis, least));
}

/**
 * |theta| of the one image on `side` of the axis. `betaOf` is strictly monotone
 * either side of the shadow — the deflection only grows as the ray closes on the
 * photon sphere — so the sole root is also the outermost, and the shadow edge is
 * a valid inner bracket end because the deflection is infinite there.
 */
function imageAngleRad(
  side: number,
  betaRad: number,
  shadowRad: number,
  outerGuessRad: number,
  betaOf: (thetaRad: number) => number,
): number {
  const beyondRoot = (t: number): boolean => Math.sign(betaOf(side * t) - betaRad) === side;

  let hi = Math.max(outerGuessRad, 4 * shadowRad);
  for (let i = 0; i < BRACKET_DOUBLINGS && !beyondRoot(hi); i++) hi *= 2;

  let lo = shadowRad;
  for (let i = 0; i < BISECTION_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (beyondRoot(mid)) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export function lensPointSource(input: {
  eye: Readonly<Vec3>;
  lens: Readonly<Vec3>;
  source: Readonly<Vec3>;
  schwarzschildRadius: number;
  /** Bending angle in radians at an impact parameter in units of r_s; Infinity = captured. */
  deflection: (impactParamRs: number) => number;
}): readonly LensedImage[] {
  const { eye, lens, source, schwarzschildRadius, deflection } = input;

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

  const distRatio = (distSource - distLens) / distSource;
  const radPerRs = schwarzschildRadius / distLens; // image angle subtended by one r_s of impact parameter
  const shadowRad = CRITICAL_IMPACT_PARAM_RS * radPerRs;
  // atan2 on the rejection, never acos on the dot: a near-on-axis source is the
  // interesting case (it is the caustic), and acos throws away half its digits
  // exactly there — enough to move the image off the ring it belongs on.
  const along = dot3(sourceDir, axis);
  const rejection: Vec3 = [
    sourceDir[0] - axis[0] * along,
    sourceDir[1] - axis[1] * along,
    sourceDir[2] - axis[2] * along,
  ];
  const betaRad = Math.atan2(Math.hypot(rejection[0], rejection[1], rejection[2]), along);
  const perp = offsetDirection(axis, rejection);

  /** Where a source must sit for its image to appear at `thetaRad`. */
  const betaOf = (thetaRad: number): number =>
    thetaRad - Math.sign(thetaRad) * distRatio * deflection(Math.abs(thetaRad) / radPerRs);

  // Weak-field Einstein radius — here only a length scale for the first bracket.
  const einsteinRad = Math.sqrt(
    (2 * schwarzschildRadius * (distSource - distLens)) / (distLens * distSource),
  );

  return [1, -1].map((side) => {
    const t = imageAngleRad(side, betaRad, shadowRad, betaRad + 2 * einsteinRad, betaOf);
    const thetaRad = side * t;
    const step = t * DERIVATIVE_STEP;
    const outward = betaOf(side * (t + step));
    const inward = betaOf(side * (t - step));
    // Central where it can be. One step INWARD of an image hugging the shadow
    // lands in the captured band, where the sampler is infinite — that would
    // read as an infinite dbeta/dtheta and zero the magnification outright,
    // reintroducing the hard edge this whole solve exists to remove.
    const dBetaDTheta = Number.isFinite(inward)
      ? (outward - inward) / (2 * step * side)
      : (outward - betaOf(thetaRad)) / (step * side);

    return {
      direction: tiltFromAxis(axis, perp, thetaRad),
      // beta = 0 is the Einstein RING: infinite for a point source, and the two
      // images are the antipodes offsetDirection picked off it. Callers cap it.
      magnification: Math.abs(thetaRad / betaRad) / Math.abs(dBetaDTheta),
    };
  });
}

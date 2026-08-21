/**
 * zoomedEyeStep — classic zoom-to-cursor as genuine pose motion.
 *
 * The eye's distance to an ANCHOR point scales by `factor`
 * (`eye′ = anchor + factor·(eye − anchor)`), and the resulting displacement is
 * split into the two terms an orbit pose carries: a distance scale along the
 * orbit axis, and a world-space lateral shift of the pivot. Yaw/pitch are
 * untouched, so the view direction is preserved and the anchor keeps its screen
 * position. The standoff floor is enforced in EYE currency — the only currency
 * that stays true once the pivot drifts off the body centre (a pan strafe, or a
 * previous lateral zoom step).
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { ZoomStep } from '../../@types/camera/ZoomStep';

export function zoomedEyeStep(
  eyeMpc: Readonly<Vec3>,
  targetMpc: Readonly<Vec3>,
  anchorMpc: Readonly<Vec3>,
  bodyCentreMpc: Readonly<Vec3>,
  floorRadiusMpc: number,
  factor: number,
): ZoomStep {
  const bx = eyeMpc[0] - anchorMpc[0];
  const by = eyeMpc[1] - anchorMpc[1];
  const bz = eyeMpc[2] - anchorMpc[2];
  const bb = bx * bx + by * by + bz * bz;

  const dx = eyeMpc[0] - targetMpc[0];
  const dy = eyeMpc[1] - targetMpc[1];
  const dz = eyeMpc[2] - targetMpc[2];
  const distance = Math.hypot(dx, dy, dz);

  // Eye ON the anchor, or a zero-distance pose: no ray to scale along.
  if (bb === 0 || distance === 0) return { distanceScale: 1, lateralMpc: [0, 0, 0] };

  // Where the eye's travel line pierces the floor sphere, as a value of the
  // same parameter `s` the zoom scales (`eye(s) = anchor + s·b`, so the current
  // eye is s = 1). The line is INSIDE the sphere for s ∈ (sIn, sOut); the eye
  // starts outside, so the clamp is one-sided in whichever direction it sits.
  const ax = anchorMpc[0] - bodyCentreMpc[0];
  const ay = anchorMpc[1] - bodyCentreMpc[1];
  const az = anchorMpc[2] - bodyCentreMpc[2];
  const ab = ax * bx + ay * by + az * bz;
  const disc = ab * ab - bb * (ax * ax + ay * ay + az * az - floorRadiusMpc * floorRadiusMpc);
  let s = factor;
  if (disc > 0) {
    const mid = -ab / bb;
    const halfSpan = Math.sqrt(disc) / bb;
    const sIn = mid - halfSpan;
    const sOut = mid + halfSpan;
    if (sOut <= 1) s = Math.max(s, sOut);
    else if (sIn >= 1) s = Math.min(s, sIn);
  }

  // eye′ − eye, split against the unit orbit axis (target → eye): the
  // along-axis part is the distance change, the remainder moves the pivot.
  // `target′ = target + lateral` then reproduces eye′ exactly, by construction.
  const tx = (s - 1) * bx;
  const ty = (s - 1) * by;
  const tz = (s - 1) * bz;
  const along = (tx * dx + ty * dy + tz * dz) / distance;

  return {
    distanceScale: (distance + along) / distance,
    lateralMpc: [
      tx - (along * dx) / distance,
      ty - (along * dy) / distance,
      tz - (along * dz) / distance,
    ],
  };
}

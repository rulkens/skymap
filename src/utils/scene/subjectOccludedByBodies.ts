/**
 * subjectOccludedByBodies — does an opaque body stand between the eye and the
 * thing an overlay names?
 *
 * The overlay passes attenuate per PIXEL (shaders/lib/sceneDepth.wesl), which
 * blanks a caption whose subject is in FRONT of the body its text happens to
 * lie over. This is the per-subject gate deciding whether that per-pixel rule
 * applies at all: the CLOSED segment eye→subject against each body sphere,
 * eye-relative so the metre-scale geometry survives f64 in the Mpc frame.
 *
 * A sphere that CONTAINS the subject is skipped: that is the body's own
 * caption (anchored at its centre), which must never occlude itself.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { SCALE_UNITS } from '../../data/scaleUnits';

type Occluder = { readonly positionMpc: Readonly<Vec3>; readonly radiusM: number };

export function subjectOccludedByBodies(input: {
  readonly subjectMpc: Readonly<Vec3>;
  readonly camPosMpc: Readonly<Vec3>;
  readonly bodies: readonly Occluder[];
}): boolean {
  const { subjectMpc, camPosMpc, bodies } = input;

  const px = subjectMpc[0] - camPosMpc[0];
  const py = subjectMpc[1] - camPosMpc[1];
  const pz = subjectMpc[2] - camPosMpc[2];
  const pp = px * px + py * py + pz * pz;
  // The eye sits on the subject: no segment, nothing between them.
  if (pp === 0) return false;

  for (const body of bodies) {
    const cx = body.positionMpc[0] - camPosMpc[0];
    const cy = body.positionMpc[1] - camPosMpc[1];
    const cz = body.positionMpc[2] - camPosMpc[2];
    const r = body.radiusM * SCALE_UNITS.M_TO_MPC;
    const rr = r * r;

    const sx = px - cx;
    const sy = py - cy;
    const sz = pz - cz;
    if (sx * sx + sy * sy + sz * sz <= rr) continue;

    // Closest approach of the segment to the centre. The projection parameter
    // is clamped to [0, 1], which is what makes a subject NEARER than the body
    // measure from the subject rather than from the infinite line — the whole
    // point of the fix.
    const t = Math.min(1, Math.max(0, (cx * px + cy * py + cz * pz) / pp));
    const dx = t * px - cx;
    const dy = t * py - cy;
    const dz = t * pz - cz;
    if (dx * dx + dy * dy + dz * dz <= rr) return true;
  }
  return false;
}

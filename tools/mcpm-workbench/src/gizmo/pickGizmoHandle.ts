import type { GizmoHandleGeometry } from '../../@types/GizmoHandleGeometry';
import type { GizmoHandleId } from '../../@types/GizmoHandleId';
import type { Ray } from '../../@types/Ray';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { closestPointOnRayToLine } from './closestPointOnRayToLine';
import { PICK_TOLERANCE_FRACTION } from './gizmoHandleGeometry';

/** Perpendicular distance from `point` to the ray, clamped to the ray's `t ≥ 0` half — a point
 *  behind the ray origin is measured against the origin itself, never an extrapolated t < 0. */
function distanceToRay(ray: Ray, point: Readonly<Vec3>): number {
  const px = point[0] - ray.origin[0];
  const py = point[1] - ray.origin[1];
  const pz = point[2] - ray.origin[2];
  const t = Math.max(0, px * ray.dir[0] + py * ray.dir[1] + pz * ray.dir[2]);
  const cx = ray.origin[0] + ray.dir[0] * t;
  const cy = ray.origin[1] + ray.dir[1] * t;
  const cz = ray.origin[2] + ray.dir[2] * t;
  return Math.hypot(point[0] - cx, point[1] - cy, point[2] - cz);
}

/** Perpendicular distance from `ray` to the SEGMENT `origin → origin + dir·length` — what the
 *  user actually sees and grabs for a translate arrow (its whole shaft), not just the tip point.
 *  Clamps the infinite-line closest-approach parameter into the segment before measuring, so a
 *  near-miss beyond the tip doesn't get pulled in by the line's unbounded extension. */
function distanceToSegment(
  ray: Ray,
  origin: Readonly<Vec3>,
  dir: Readonly<Vec3>,
  length: number,
): number {
  const t = Math.min(length, Math.max(0, closestPointOnRayToLine(ray, origin, dir)));
  const point: Vec3 = [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
  return distanceToRay(ray, point);
}

/** Per-axis half-extent recovered from the resize handles' own distance from the rotate ring's
 *  shared center, rather than threading GridBox through `pickGizmoHandle` too — `geometry` already
 *  carries everything the tolerance formula (spec §5) needs. */
function halfExtentsFromGeometry(geometry: GizmoHandleGeometry): Vec3 {
  const center = geometry.rotate[0].centerMpc;
  const half: Vec3 = [0, 0, 0];
  for (const handle of geometry.resize) {
    const dx = handle.positionMpc[0] - center[0];
    const dy = handle.positionMpc[1] - center[1];
    const dz = handle.positionMpc[2] - center[2];
    half[handle.id.axis] = Math.hypot(dx, dy, dz);
  }
  return half;
}

/**
 * pickGizmoHandle — nearest handle within world-space pick tolerance of the ray, or `null`.
 * Translate arrows hit-test the whole center→tip shaft (segment), since that's the visible,
 * grabbable shape; resize crosses stay point-tested at their single drawn position. Rotate
 * rings are skipped outright while `radiusMpc <= 0` (F1 stub geometry — `gizmoHandleGeometry`
 * doesn't place real rings until F2, so there is nothing on them yet to hit-test).
 *
 * Deliberate asymmetry: translate arrows hold a constant screen size (gizmoArrowLengthMpc), so
 * their tolerance rebases onto their OWN length — `PICK_TOLERANCE_FRACTION · arrowLength`,
 * recovered per-axis from the tip's distance from center — not the box-based
 * `PICK_TOLERANCE_FRACTION · min(halfExtentMpc)` resize handles keep, since those still scale
 * with the box.
 */
export function pickGizmoHandle(ray: Ray, geometry: GizmoHandleGeometry): GizmoHandleId | null {
  const half = halfExtentsFromGeometry(geometry);
  const resizeTolerance = PICK_TOLERANCE_FRACTION * Math.min(half[0], half[1], half[2]);
  const center = geometry.rotate[0].centerMpc;

  let bestId: GizmoHandleId | null = null;
  let bestDist = Infinity;

  for (const handle of geometry.translate) {
    const length = Math.hypot(
      handle.positionMpc[0] - center[0],
      handle.positionMpc[1] - center[1],
      handle.positionMpc[2] - center[2],
    );
    const tolerance = PICK_TOLERANCE_FRACTION * length; // arrow's own scale, not the box's.
    const dist = distanceToSegment(ray, center, handle.axisDir, length);
    if (dist <= tolerance && dist <= bestDist) {
      bestDist = dist;
      bestId = handle.id;
    }
  }

  for (const handle of geometry.resize) {
    const dist = distanceToRay(ray, handle.positionMpc);
    if (dist <= resizeTolerance && dist <= bestDist) {
      bestDist = dist;
      bestId = handle.id;
    }
  }

  for (const ring of geometry.rotate) {
    if (ring.radiusMpc <= 0) continue; // F1 stub — see doc comment above.
  }

  return bestId;
}

/**
 * cameraGizmoLines — draw a camera pose as world-anchored debug lines: the
 * eye→target sightline plus a frustum outline (four edges eye→corner and the
 * rectangle joining the corners) at the target plane.
 *
 * Used by the debug clip-path inspector's scrubber: at the scrubbed instant it
 * shows where the camera sits, what it looks at, and roughly what it frames.
 * The rectangle sits at the TARGET distance (|target−eye|), so the sightline
 * ends at the rectangle's centre — a quick read of "this is the framed view".
 *
 * Output order is fixed — [sight, edge×4, rect×4] — so callers can slice it
 * without ids. The basis is built from the view forward and world up; near the
 * poles (forward ∥ world up) it falls back to world +X as the reference so the
 * cross products stay well-defined.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { Vec4 } from '../../../@types/math/Vec4';
import type { DebugLine } from '../../../@types/rendering/DebugLine';

const GIZMO_COLOR: Vec4 = [1, 0.85, 0.1, 1]; // amber — distinct from the speed-coloured route
const GIZMO_WIDTH_PX = 2;

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(a: Vec3): Vec3 {
  const m = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / m, a[1] / m, a[2] / m];
}

export function cameraGizmoLines(
  eye: Vec3,
  target: Vec3,
  fovYRad: number,
  aspect: number,
): DebugLine[] {
  const toTarget = sub(target, eye);
  const dist = Math.hypot(toTarget[0], toTarget[1], toTarget[2]) || 1;
  const forward = norm(toTarget);

  // Right/up basis; near the poles use world +X as the reference vector.
  const worldUp: Vec3 = Math.abs(forward[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
  const right = norm(cross(forward, worldUp));
  const up = norm(cross(right, forward));

  const h = dist * Math.tan(fovYRad / 2);
  const w = h * aspect;
  const centre = add(eye, scale(forward, dist));
  // Corners: TL, TR, BR, BL (CCW from top-left) at the target plane.
  const corners: Vec3[] = [
    add(centre, add(scale(right, -w), scale(up, h))),
    add(centre, add(scale(right, w), scale(up, h))),
    add(centre, add(scale(right, w), scale(up, -h))),
    add(centre, add(scale(right, -w), scale(up, -h))),
  ];

  const line = (from: Vec3, to: Vec3): DebugLine => ({
    from,
    to,
    width: GIZMO_WIDTH_PX,
    color: GIZMO_COLOR,
  });

  const lines: DebugLine[] = [line(eye, target)]; // [0] = sightline
  corners.forEach((c) => lines.push(line(eye, c))); // [1..4] = edges
  for (let i = 0; i < 4; i++) lines.push(line(corners[i]!, corners[(i + 1) % 4]!)); // [5..8] = rect
  return lines;
}

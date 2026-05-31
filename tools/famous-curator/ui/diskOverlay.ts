/**
 * diskOverlay — pure helpers for the disk-overlay ellipse in the curator UI.
 *
 * All coordinates are in SOURCE-image pixels.  No DOM, no React.
 *
 * PA convention (matches deprojectDisk's θ exactly):
 *   paDeg = angle of the disk MAJOR axis, measured from +X (image right)
 *   toward +Y (image down, because the image frame is y-down).  Range [0,180)
 *   — position angles are axially symmetric (180° is the same direction as 0°).
 *
 *   majorUnit = [cos(paDeg), sin(paDeg)]
 *   minorUnit = [-sin(paDeg), cos(paDeg)]
 *
 * Spot-check against deprojectDisk:
 *   θ=0  → major is +X (horizontal); M scales image-Y (the minor axis). ✓
 *   θ=90 → major is +Y (vertical);   M scales image-X (the minor axis). ✓
 *
 * Because the minor handle lives along minorUnit and the round-trip
 * axisRatioFromMinorDrag(minorAxisHandle(disk, r)) must recover r, these
 * helpers are each other's inverse at the geometry level.
 */

import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { RecipeDisk } from '../plugin/recipe';

/**
 * Wrap an angle (degrees) into [0, 180).
 * A position angle is axially symmetric — 180° is the same axis as 0° — so
 * [0, 180) is the canonical half-turn domain.  The double-modulo pattern
 * handles negative inputs correctly (JavaScript % is remainder, not modulo).
 */
function normalizePa(deg: number): number {
  return ((deg % 180) + 180) % 180;
}

/**
 * Build disk geometry from a centre→edge drag, all in source-image pixels.
 *
 *   radiusPx = distance from centre to edge.
 *   paDeg    = normalizePa(atan2(dy, dx) in degrees),
 *              where dy = edge.y − centre.y, dx = edge.x − centre.x.
 *
 * A zero-length drag returns radiusPx=0 and paDeg=0 (atan2(0,0) is 0 in
 * most implementations; the caller should guard against a zero-radius disk
 * before committing the annotation to a recipe).
 */
export function diskFromDrag(
  centerPx: Vec2,
  edgePx: Vec2,
): { centerPx: Vec2; radiusPx: number; paDeg: number } {
  const dx = edgePx[0] - centerPx[0];
  const dy = edgePx[1] - centerPx[1];
  const radiusPx = Math.hypot(dx, dy);
  const angleRad = Math.atan2(dy, dx);
  const angleDeg = (angleRad * 180) / Math.PI;
  const paDeg = normalizePa(angleDeg);
  return { centerPx, radiusPx, paDeg };
}

/**
 * Minor-axis handle endpoint (source px) for rendering the perpendicular
 * handle in the overlay UI.
 *
 *   handle = centre + radiusPx * axisRatio * minorUnit
 *   minorUnit = [-sin(paDeg), cos(paDeg)]
 *
 * The handle is placed along the minor axis at the scaled minor-axis edge.
 * Rendering both this point and the major-axis edge gives the user two
 * draggable handles to set both disk size (radiusPx) and shape (axisRatio).
 */
export function minorAxisHandle(disk: RecipeDisk, axisRatio: number): Vec2 {
  const rad = (disk.paDeg * Math.PI) / 180;
  const minorX = -Math.sin(rad);
  const minorY = Math.cos(rad);
  const scale = disk.radiusPx * axisRatio;
  return [disk.centerPx[0] + scale * minorX, disk.centerPx[1] + scale * minorY];
}

/**
 * axisRatio implied by dragging the minor handle to pointPx.
 *
 *   v = pointPx − centre
 *   axisRatio = |v · minorUnit| / radiusPx
 *
 * The absolute value handles the case where the user drags to the opposite
 * side of the centre (both ends of the minor axis are equivalent).
 * Clamped to (ε, 1] — a zero-length drag would produce 0, yielding a
 * degenerate line; ε=1e-6 keeps the value positive and finite.  The upper
 * bound of 1 prevents an "over-round" annotation that implies face-on even
 * when the major drag was clearly elongated.
 */
export function axisRatioFromMinorDrag(disk: RecipeDisk, pointPx: Vec2): number {
  const epsilon = 1e-6;
  const rad = (disk.paDeg * Math.PI) / 180;
  const minorX = -Math.sin(rad);
  const minorY = Math.cos(rad);
  const vx = pointPx[0] - disk.centerPx[0];
  const vy = pointPx[1] - disk.centerPx[1];
  const dot = Math.abs(vx * minorX + vy * minorY);
  const raw = dot / disk.radiusPx;
  return Math.min(1, Math.max(epsilon, raw));
}

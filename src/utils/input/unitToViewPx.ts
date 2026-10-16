import type { UnitPoint } from '../../@types/input/UnitPoint';
import type { Vec2 } from '../../@types/math/Vec2';

/**
 * Snap grid, 2^-16 CSS px: far below any pointer's resolution, and coarse
 * enough to absorb the unit round trip's float noise (no double u gives
 * u · 100 === 55), so a canvas pixel comes back as exactly itself.
 */
const PX_GRID = 2 ** 16;

/** CSS px of the view: the one place a source's unit position becomes engine pixels. */
export function unitToViewPx(at: UnitPoint, viewPx: Readonly<Vec2>): Vec2 {
  return [
    Math.round(at.x * viewPx[0] * PX_GRID) / PX_GRID,
    Math.round(at.y * viewPx[1] * PX_GRID) / PX_GRID,
  ];
}

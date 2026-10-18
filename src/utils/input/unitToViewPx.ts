import type { UnitPoint } from '../../@types/input/UnitPoint';
import type { Vec2 } from '../../@types/math/Vec2';

// 2^-16 px grid: absorbs the unit round trip's float noise
const GRID_STEPS_PER_PX = 2 ** 16;

/** CSS px of the view: the one place a source's unit position becomes engine pixels. */
export function unitToViewPx(at: UnitPoint, viewPx: Readonly<Vec2>): Vec2 {
  return [
    Math.round(at.x * viewPx[0] * GRID_STEPS_PER_PX) / GRID_STEPS_PER_PX,
    Math.round(at.y * viewPx[1] * GRID_STEPS_PER_PX) / GRID_STEPS_PER_PX,
  ];
}

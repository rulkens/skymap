/** fieldLabel — the standing lens as "field 60°"; a tenth of a degree below 10°, where the lens reaches 0.5°. */

import { radToDeg } from '../math/radToDeg';

export function fieldLabel(fovYRad: number): string {
  const deg = radToDeg(fovYRad);
  return `field ${deg < 10 ? deg.toFixed(1) : Math.round(deg)}°`;
}

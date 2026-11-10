/** fieldLabel — the standing lens as "field 60°", or "field 5′" under a degree. */

import { radToDeg } from '../math/radToDeg';
import { formatLensDeg } from '../format/formatLensDeg';

export function fieldLabel(fovYRad: number): string {
  return `field ${formatLensDeg(radToDeg(fovYRad))}`;
}

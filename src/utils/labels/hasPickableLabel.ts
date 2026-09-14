/**
 * hasPickableLabel — the label layers' `pickEnabled` gate, deliberately the
 * CHEAP half of the pick path: identity + alpha, no projection.
 */

import type { Label2D } from '../../@types/rendering/Label2D';
import { isPickableLabel } from './isPickableLabel';

export function hasPickableLabel(labels: readonly Label2D[]): boolean {
  return labels.some(isPickableLabel);
}

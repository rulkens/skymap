/**
 * antiqueGlobePlateWeight — how far a globe has become the plate's subject, 0–1,
 * from its apparent radius in print units: 0 while it is a figure on a wider
 * chart, 1 once its disc spans most of the plate's half-height. At 0.5 the
 * cartouche is blank between the chart's title and the globe's (`antiquePlateTitles`),
 * and the Moon fades the sky's rulings, trails and figures on the same weight.
 */

import { ANTIQUE_REFERENCE_HEIGHT_CSS } from '../../../data/rendering/antiqueLook';
import { smoothstep } from '../../math/smoothstep';

const SPAN = [0.3, 0.5] as const;

export function antiqueGlobePlateWeight(
  radiusUnits: number,
  span: readonly [number, number] = SPAN,
): number {
  return smoothstep(span[0], span[1], radiusUnits / (ANTIQUE_REFERENCE_HEIGHT_CSS / 2));
}

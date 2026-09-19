/**
 * fadeWindow — composes several `fadeBand`s (an approach band × a recede
 * band, typically) into one scalar: the product of all of them. A layer that
 * fades in past one edge and back out past another used to hand-multiply the
 * two `fadeBand` calls at each call site (ZoA's opacity, e.g.); this is that
 * one line, generalised to any number of bands so a third edge is a list
 * entry, not a second copy of the multiply.
 */

import type { FadeBand } from '../../@types/math/FadeBand';
import { fadeBand } from './fadeBand';

export function fadeWindow(bands: readonly FadeBand[], value: number): number {
  return bands.reduce((alpha, band) => alpha * fadeBand(band, value), 1);
}

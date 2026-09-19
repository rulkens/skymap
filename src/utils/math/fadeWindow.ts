/** fadeWindow — the product of several `fadeBand`s (e.g. an approach band × a recede band). */

import type { FadeBand } from '../../@types/math/FadeBand';
import { fadeBand } from './fadeBand';

export function fadeWindow(bands: readonly FadeBand[], value: number): number {
  return bands.reduce((alpha, band) => alpha * fadeBand(band, value), 1);
}

import type { FadeBand } from '../../@types/math/FadeBand';
import { fadeBand } from './fadeBand';

/** True while at least one band is above zero at `value` — the "does anything draw" gate. */
export function anyFadeBandVisible(bands: readonly FadeBand[], value: number): boolean {
  return bands.some((band) => fadeBand(band, value) > 0);
}

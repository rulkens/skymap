import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import type { AsteroidTuning } from '../../@types/AsteroidTuning';
import { ASTEROID_CLASSES } from '../../../../data/asteroids/asteroidClasses';

/**
 * The share of each shown class the brightness budget keeps at this zoom (AU): 1 up to the start
 * zoom, budget / shown rows from the full zoom on, geometric in zoom between, so the count falls
 * evenly per zoom step. Shown rows are the classes not faded out, so a class switched off frees its
 * share of the budget for the others.
 */
export function asteroidKeptFraction(
  hCentiByClass: Readonly<Record<AsteroidClass, Uint16Array>>,
  fade: Readonly<Record<AsteroidClass, number>>,
  zoomAu: number,
  thinning: Pick<AsteroidTuning, 'thinBudget' | 'thinStartZoomAu' | 'thinFullZoomAu'>,
): number {
  let shown = 0;
  for (const cls of ASTEROID_CLASSES) if (fade[cls] > 0) shown += hCentiByClass[cls].length;
  const atFull = Math.min(1, thinning.thinBudget / Math.max(shown, 1));
  const span = Math.log(thinning.thinFullZoomAu / thinning.thinStartZoomAu);
  const reached = Math.log(zoomAu / thinning.thinStartZoomAu);
  const t = span > 0 ? reached / span : reached >= 0 ? 1 : 0;
  return atFull ** Math.min(Math.max(t, 0), 1);
}

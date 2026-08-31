/**
 * earthUniverseLoop — forever-looping "Earth ⇄ Universe": dolly out to the
 * observable horizon and back, the ambient loop `earthFlyout` (its one-shot
 * cousin) inspired. Mechanics live in `makeEarthLoop`.
 */

import { makeEarthLoop } from './makers/makeEarthLoop';

export const earthUniverseLoop = makeEarthLoop({
  id: 'earthUniverseLoop',
  label: 'Earth ⇄ Universe (loop)',
  farDistanceMpc: 29_500,
});

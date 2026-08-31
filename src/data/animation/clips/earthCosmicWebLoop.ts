/**
 * earthCosmicWebLoop — the README-hero variant of `earthUniverseLoop`: turns
 * around a quarter of the way out, where the catalogued cosmic web still
 * fills the frame instead of shrinking to a dot, and with every label layer
 * hidden so the capture reads as pure scenery.
 */

import { makeEarthLoop } from './makers/makeEarthLoop';

export const earthCosmicWebLoop = makeEarthLoop({
  id: 'earthCosmicWebLoop',
  label: 'Earth ⇄ Cosmic web (loop)',
  farDistanceMpc: 7_400,
  hideLabels: true,
});

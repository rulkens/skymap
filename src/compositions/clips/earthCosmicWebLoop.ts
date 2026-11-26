/**
 * earthCosmicWebLoop — the README-hero variant of `earthUniverseLoop`: turns
 * around inside the survey volume, where the catalogued cosmic web still
 * fills the frame instead of shrinking to a dot, and with every label layer
 * hidden so the capture reads as pure scenery.
 */

import { makeEarthLoop } from './makers/makeEarthLoop';

export const earthCosmicWebLoop = makeEarthLoop({
  id: 'earthCosmicWebLoop',
  label: 'Earth ⇄ Cosmic web (loop)',
  farDistanceMpc: 660,
  hideLabels: true,
  // Crawl through the Milky Way: the middle leg dwells on the 0.025–0.09 Mpc
  // band (the galaxy fills the frame near 0.048) at ~12× fewer decades per
  // second than the legs either side.
  outbound: [
    { toMpc: 0.025, sec: 27, ease: 'easeInOutCubic' },
    { toMpc: 0.09, sec: 18, ease: 'linear' },
    { toMpc: 660, sec: 25, ease: 'easeInOutCubic' },
  ],
});

/**
 * sStarsOrbit — the S-stars from 50° off S2's orbit normal, the camera
 * circling as the clock runs two years per second, so the orbits read as the
 * 3D tangle they are rather than a diagram.
 */

import { makeSStarsClip } from './makers/makeSStarsClip';

export const sStarsOrbit = makeSStarsClip({
  id: 'sStarsOrbit',
  label: 'S-stars, orbiting',
  tiltRad: 0.9,
  spinRad: 1.6,
  dolly: { fromAu: 2200, toAu: 1600, startSec: 0, overSec: 27 },
  years: [
    [0, 0],
    [1, 0],
    [25, 48],
  ],
  durationSec: 27,
});

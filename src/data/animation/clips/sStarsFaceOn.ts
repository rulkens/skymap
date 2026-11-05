/**
 * sStarsFaceOn — the S-stars alone on black, from straight above S2's orbit, the camera all
 * but still, two years per second: the orbits are the only motion on screen.
 */

import { makeSStarsClip } from './makers/makeSStarsClip';

export const sStarsFaceOn = makeSStarsClip({
  id: 'sStarsFaceOn',
  label: 'S-stars, face-on',
  tiltRad: 0,
  spinRad: 0.15,
  dolly: { fromAu: 1700, toAu: 1350, startSec: 0, overSec: 27 },
  years: [
    [0, 0],
    [1, 0],
    [25, 48],
  ],
  durationSec: 27,
  hideField: true,
});

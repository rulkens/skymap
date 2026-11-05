/**
 * sStarsPushIn — from the crowded bulge stars 300 pc out, a log push in to the
 * S-star cluster around Sgr A*, the clock waking up only on arrival: still
 * while we travel, then half a year, then two years per second.
 */

import { makeSStarsClip } from './makers/makeSStarsClip';

const PC_IN_AU = 206_265;

export const sStarsPushIn = makeSStarsClip({
  id: 'sStarsPushIn',
  label: 'S-stars, push in',
  tiltRad: 0.4,
  spinRad: 0.6,
  dolly: { fromAu: 300 * PC_IN_AU, toAu: 1600, startSec: 1, overSec: 13 },
  years: [
    [0, 0],
    [12, 0.3],
    [16, 3],
    [29, 30],
  ],
  durationSec: 29,
  keepBulge: true,
});

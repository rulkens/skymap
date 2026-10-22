import type { SiteLoop } from '../@types/SiteLoop';

// One turn of Earth against the stars, in days: after it the same face is towards the camera.
const SIDEREAL_DAY = 0.99727;

/**
 * The films `npm run site:loops` records, one per place on Home. A row's id
 * is its file name in `src/assets/loops/`.
 */
export const SITE_LOOPS: readonly SiteLoop[] = [
  { id: 'place-earth', shot: 'place-earth', motion: { clockDays: SIDEREAL_DAY }, seconds: 5 },
  { id: 'place-moon', shot: 'place-moon', motion: 'orbit', seconds: 5 },
  { id: 'place-perseverance', shot: 'place-perseverance', motion: 'orbit', seconds: 5 },
  { id: 'place-saturn', shot: 'place-saturn', motion: 'orbit', seconds: 5 },
  { id: 'place-voyager1', shot: 'place-voyager1', motion: 'orbit', seconds: 5 },
  { id: 'place-betelgeuse', shot: 'place-betelgeuse', motion: { swayDeg: 20 }, seconds: 5 },
  { id: 'place-sgr-a', shot: 'place-sgr-a', motion: 'orbit', seconds: 5 },
  { id: 'place-andromeda', shot: 'place-andromeda', motion: 'orbit', seconds: 5 },
  { id: 'place-virgo', shot: 'place-virgo', motion: { swayDeg: 12 }, seconds: 5 },
  // The Features page's Domes film: the dome swings as a horizontal drag on the phone remote would turn it.
  { id: 'features-dome-remote', shot: 'dome-earth', motion: { swayDeg: 25 }, seconds: 6, width: 480 },
  // The Features page's clock films. No short span brings all four moons back, so Jupiter's jumps where it repeats.
  {
    id: 'features-time-jupiter',
    shot: 'features-time-jupiter',
    motion: { clockDays: 4 },
    seconds: 5,
    width: 960,
  },
  {
    id: 'features-time-earth',
    shot: 'features-time-earth',
    motion: { clockDays: SIDEREAL_DAY },
    seconds: 5,
  },
];

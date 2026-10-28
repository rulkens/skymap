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
    width: 960,
  },
  // 120 frames of three turns of Earth each: the globe keeps still while the Sun's light goes round, and the year ends 6 days short.
  {
    id: 'features-time-seasons',
    shot: 'features-time-seasons',
    motion: { clockDays: 360 * SIDEREAL_DAY },
    seconds: 5,
    width: 960,
  },
  // One turn of the Moon about Earth, so the camera comes back; the Sun's light is two days short of full at the end.
  {
    id: 'features-time-moon',
    shot: 'features-time-moon',
    motion: { clockDays: 27.321661, orbitTurns: 1 },
    seconds: 5,
    width: 960,
  },
  // Twenty years: Voyager 1 jumps back to where it began where the film repeats.
  {
    id: 'features-time-voyager',
    shot: 'features-time-voyager',
    motion: { clockDays: 20 * 365.25, swayDeg: 4 },
    seconds: 5,
    width: 960,
  },
  // Eight years bring Venus round thirteen times and Earth eight; the outer planets and Mercury jump where it repeats.
  {
    id: 'features-time-planets',
    shot: 'features-time-planets',
    motion: { clockDays: 8 * 365.25, swayDeg: 4 },
    seconds: 5,
    width: 960,
  },
];

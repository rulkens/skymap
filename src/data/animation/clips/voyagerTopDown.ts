/**
 * voyagerTopDown — both Voyagers from launch to now, seen from high over the
 * ecliptic so the planetary encounters read as a map. See `makeVoyagerTour`.
 */

import { makeVoyagerTour } from './makers/makeVoyagerTour';

export const voyagerTopDown = makeVoyagerTour({
  id: 'voyagerTopDown',
  label: 'Voyager 1 & 2, from above',
  elevationRad: (70 * Math.PI) / 180,
  spinRad: 0.3,
  hideStars: true,
});

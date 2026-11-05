/**
 * voyagerOblique — both Voyagers from launch to now from a low three-quarter
 * view, orbiting as they go, so the two paths read as leaving the plane of the
 * planets in different directions. See `makeVoyagerTour`.
 */

import { makeVoyagerTour } from './makers/makeVoyagerTour';

export const voyagerOblique = makeVoyagerTour({
  id: 'voyagerOblique',
  label: 'Voyager 1 & 2, three-quarter view',
  elevationRad: (22 * Math.PI) / 180,
  spinRad: 1.4,
});

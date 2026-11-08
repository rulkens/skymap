/**
 * ANTIQUE_MOON_LABEL_PLACES — every Moon name the plate can letter: Riccioli's near-side
 * set, then the IAU's far-side names. The print pass matches only the first to its craters.
 */

import type { AntiqueMoonPlace } from '../../@types/rendering/AntiqueMoonPlace';
import { ANTIQUE_MOON_PLACES } from './antiqueMoonPlaces';
import { ANTIQUE_MOON_FAR_SIDE_PLACES } from './antiqueMoonFarSidePlaces.generated';

export const ANTIQUE_MOON_LABEL_PLACES: readonly AntiqueMoonPlace[] = [
  ...ANTIQUE_MOON_PLACES,
  ...ANTIQUE_MOON_FAR_SIDE_PLACES,
];

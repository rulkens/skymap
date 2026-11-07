/**
 * ANTIQUE_PLACE_LETTERING — label id → how the antique look sets a map name its
 * producer placed (`AntiquePlaceLettering`): the towns of `ANTIQUE_EARTH_TOWNS`
 * in Visscher's hierarchy (roman upper and lower case for chartered towns, the
 * larger the town the larger the type; italic for villages), each to the right
 * of its sign. `antiqueLabel` shows such a name whatever its producer's rule hides.
 */

import type { AntiquePlaceLettering } from '../../@types/rendering/AntiquePlaceLettering';
import { ANTIQUE_EARTH_TOWNS } from './antiqueEarthTowns';

/** A town's name px by tier (capital, city, town, village). */
const TOWN_NAME_PX = [19, 16, 14, 12] as const;

export const ANTIQUE_PLACE_LETTERING: Readonly<Record<string, AntiquePlaceLettering>> =
  Object.fromEntries(
    ANTIQUE_EARTH_TOWNS.map((town) => [
      town.id,
      { cut: town.tier === 3 ? 'italic' : 'roman', px: TOWN_NAME_PX[town.tier], centred: false },
    ]),
  );

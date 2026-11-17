/**
 * ANTIQUE_PLACE_LETTERING — label id → how the antique look sets a map name its
 * producer placed (`AntiquePlaceLettering`): the towns of `ANTIQUE_EARTH_TOWNS`
 * in Visscher's hierarchy (roman upper and lower case for chartered towns, the
 * larger the town the larger the type; italic for villages), each to the right
 * of its sign; and the Moon's names (`ANTIQUE_MOON_PLACES`) as Riccioli's plate
 * cut them, maria spaced across their plains, Terrae in roman capitals, craters
 * in italic beside or on them. `antiqueLabel` shows such a name whatever its
 * producer's rule hides.
 */

import type { AntiquePlaceLettering } from '../../@types/rendering/AntiquePlaceLettering';
import { ANTIQUE_EARTH_TOWNS } from './antiqueEarthTowns';
import { ANTIQUE_MOON_LABEL_PLACES } from './antiqueMoonLabelPlaces';

/** A town's name px by tier (capital, city, town, village). */
const TOWN_NAME_PX = [19, 16, 14, 12] as const;

const MOON_LETTERING_OF_KIND = {
  mare: { cut: 'spacedItalic', px: 13, centred: true, trackingEm: 0.15 },
  terra: { cut: 'capitals', px: 12, centred: true, trackingEm: 0.5 },
  // Not centred: its producer sets it on the floor, or right or left of the rim.
  crater: { cut: 'italic', px: 13, centred: false },
} as const satisfies Record<string, AntiquePlaceLettering>;

export const ANTIQUE_PLACE_LETTERING: Readonly<Record<string, AntiquePlaceLettering>> = {
  ...Object.fromEntries(
    ANTIQUE_EARTH_TOWNS.map((town) => [
      town.id,
      { cut: town.tier === 3 ? 'italic' : 'roman', px: TOWN_NAME_PX[town.tier], centred: false },
    ]),
  ),
  ...Object.fromEntries(
    ANTIQUE_MOON_LABEL_PLACES.map((place) => [
      place.id,
      // A name Riccioli never knew is set upright, not in his italic.
      place.modern
        ? { ...MOON_LETTERING_OF_KIND[place.kind], cut: 'roman' }
        : MOON_LETTERING_OF_KIND[place.kind],
    ]),
  ),
};

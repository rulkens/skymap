/**
 * ANTIQUE_AREA_LETTERING — label id → cut for a name set over the land, sea or
 * part of the Galaxy it names (`ANTIQUE_EARTH_PLACES`, `ANTIQUE_MILKY_WAY_NAMES`).
 * `antiqueLabel` centres it on its anchor and shows it whatever its producer's rule
 * hides; the director never makes it a title, though it carries its body as subject
 * to keep the body's focus emphasis.
 */

import type { AntiqueLettering } from '../../@types/rendering/AntiqueLettering';
import { ANTIQUE_EARTH_PLACES } from './antiqueEarthPlaces';
import { ANTIQUE_MILKY_WAY_NAMES } from './antiqueMilkyWayNames';

const CUT_OF_KIND = { land: 'capitals', sea: 'italic' } as const;

export const ANTIQUE_AREA_LETTERING: Readonly<Record<string, AntiqueLettering>> = {
  ...Object.fromEntries(ANTIQUE_EARTH_PLACES.map((place) => [place.id, CUT_OF_KIND[place.kind]])),
  ...Object.fromEntries(ANTIQUE_MILKY_WAY_NAMES.map((name) => [name.id, name.cut])),
};

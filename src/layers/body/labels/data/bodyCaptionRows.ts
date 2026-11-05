/**
 * BODY_CAPTION_ROWS — each body caption's declutter priority and its item of the
 * `label:body` entry: Earth, then the planets and small bodies by
 * `PlanetBody.captionKind`.
 */

import { EARTH_ENTRY } from '../../sources/earth';
import { PLANET_ENTRY } from '../../sources/planet';
import { SMALL_BODY_ENTRY } from '../../sources/smallBody';

export const BODY_CAPTION_ROWS = {
  earth: { priority: 30, item: EARTH_ENTRY.id },
  planet: { priority: 20, item: PLANET_ENTRY.id },
  // Below the planets they orbit among.
  smallBody: { priority: 18, item: SMALL_BODY_ENTRY.id },
} as const;

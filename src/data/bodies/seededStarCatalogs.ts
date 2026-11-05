/**
 * SEEDED_STAR_CATALOGS — the drawn rows behind every star catalog that ships
 * no `.bin`, keyed by registry id; total over `SeededStarCatalogId`, so a new
 * row is a compile error until it has a table. The star show entry declares
 * it as its `bodies`, so core learns the stars from the entry, never from here.
 * Tables stay separate: a packed pick id indexes ONE, never merged.
 */

import { SCENE_STARS } from './sceneStars';
import { SCENE_SUN } from './sceneSun';
import { SCENE_S_STARS } from './sceneSStars';
import type { SeededStarCatalogId } from '../../@types/data/starCatalog/SeededStarCatalogId';
import type { StarBody } from '../../@types/scene/StarBody';

export const SEEDED_STAR_CATALOGS: Readonly<Record<SeededStarCatalogId, readonly StarBody[]>> = {
  famousStar: SCENE_STARS,
  sun: SCENE_SUN,
  sStar: SCENE_S_STARS,
};

/**
 * SEEDED_STAR_CATALOGS — the drawn rows behind every star catalog that ships no
 * `.bin`, keyed by its registry id. Total over `SeededStarCatalogId`, so a new
 * seeded row is a compile error until it has a table.
 *
 * Lives in `data/` rather than in the Layer because core's slab and occluder
 * seam (`frameContext`, `deriveView`, `sceneOccluderBodies`) reads the drawn
 * seeded set. The tables stay separate: a packed pick id is an index into ONE
 * of them, so concatenating would renumber saved selections.
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

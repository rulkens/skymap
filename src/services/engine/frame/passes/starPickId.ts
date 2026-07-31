/**
 * starPickId — the packed pick identity for one seeded star, and the single
 * place that decides which seed table a star's id belongs to.
 *
 * TWO tables, never merged. A packed id is a stable INDEX into one table
 * (`seedIndexOfBody`), so concatenating the S-stars onto `SCENE_STARS` would
 * renumber every famous star and break every saved selection URL. Each table
 * therefore carries its own source code, and `PICK_SEEDS_BY_BODY_ID` decodes
 * back through the matching one.
 *
 * `null` for an id in neither table — `seedIndexOfBody`'s −1 contract hoisted to
 * the caller, which must SKIP rather than stamp: an id packed from −1 aliases
 * body 0.
 */

import { Source } from '../../../../data/sources';
import { SCENE_STARS } from '../../../../data/bodies/sceneStars';
import { SCENE_S_STARS } from '../../../../data/bodies/sceneSStars';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import { seedIndexOfBody } from './seedIndexOfBody';

export function starPickId(id: string): number | null {
  const sStarIndex = seedIndexOfBody(id, SCENE_S_STARS);
  if (sStarIndex >= 0) return packSelection(Source.SStar, sStarIndex + PICK_SENTINEL_OFFSET);
  const famousIndex = seedIndexOfBody(id, SCENE_STARS);
  if (famousIndex >= 0) return packSelection(Source.FamousStar, famousIndex + PICK_SENTINEL_OFFSET);
  return null;
}

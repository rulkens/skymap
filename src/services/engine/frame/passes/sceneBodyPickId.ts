/**
 * sceneBodyPickId — the packed pick identity for one seeded scene body, by id.
 *
 * The caption pick's twin of what each body layer's `drawPick` stamps for its
 * own geometry: Earth and Sgr A* are singletons under their own source codes,
 * a planet or moon indexes `SCENE_PLANETS` under `Source.Planet`, and anything
 * else falls through to `starPickId`'s two star tables. Same source codes,
 * same seed tables, same `PICK_SENTINEL_OFFSET` — so a body picked by its
 * caption resolves to the same selection as one picked by its disc.
 *
 * `null` for an unseeded id, the `seedIndexOfBody` −1 contract: the caller
 * must SKIP rather than stamp, since an id packed from −1 aliases body 0.
 */

import { Source } from '../../../../data/sources';
import { SCENE_EARTH } from '../../../../data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../../data/bodies/scenePlanets';
import { SGR_A_STAR } from '../../../../data/bodies/sceneSgrAStar';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import { seedIndexOfBody } from './seedIndexOfBody';
import { starPickId } from './starPickId';

export function sceneBodyPickId(id: string): number | null {
  if (id === SCENE_EARTH.id) return packSelection(Source.Earth, 0 + PICK_SENTINEL_OFFSET);
  if (id === SGR_A_STAR.id) return packSelection(Source.SgrAStar, 0 + PICK_SENTINEL_OFFSET);
  const planetIndex = seedIndexOfBody(id, SCENE_PLANETS);
  if (planetIndex >= 0) return packSelection(Source.Planet, planetIndex + PICK_SENTINEL_OFFSET);
  return starPickId(id);
}

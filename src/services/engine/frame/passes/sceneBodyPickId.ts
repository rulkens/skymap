/**
 * sceneBodyPickId — the packed pick identity for one seeded scene body, by id.
 *
 * The caption pick's twin of each body layer's `drawPick` — same source codes,
 * seed tables, and `PICK_SENTINEL_OFFSET` — so a caption pick resolves to the
 * same selection as a disc pick. Earth/Sgr A* are singletons; a planet/moon
 * indexes `SCENE_PLANETS`; anything else falls through to `starPickId`. Returns
 * `null` for an unseeded id: the caller must SKIP, since packing
 * `seedIndexOfBody`'s −1 sentinel would alias body 0.
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

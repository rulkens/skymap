/**
 * asteroidsSearch — one palette row per named asteroid, yielded once the catalog has loaded
 * (opening the palette loads it, `asteroidsAssetRows`). The unnamed majority is reachable by pick and
 * link only. The bare name rides beside `(433) Eros` so typing "Eros" is an exact match.
 */
import { encodeAsteroidFocusId } from './encodeAsteroidFocusId';
import { asteroidLabel } from '../../selection/present/asteroidLabel';
import { asteroidNameAt } from '../../catalog/utils/asteroidNameAt';
import { MESH_ASTEROID_BODIES } from '../../../../data/asteroids/meshAsteroidBodies';
import { awaitSlotValue } from '../../../../utils/loading/awaitSlotValue';
import type { LayerSearchEntry } from '../../../../@types/engine/layer/LayerSearchEntry';
import type { AsteroidsRuntime } from '../../@types/AsteroidsRuntime';

export async function* asteroidsSearch(
  runtime: AsteroidsRuntime,
): AsyncIterable<readonly LayerSearchEntry[]> {
  const catalog = await awaitSlotValue(runtime.slot);
  if (catalog === null) return;
  const { names } = catalog;
  const rows: LayerSearchEntry[] = [];
  names.numbers.forEach((number, j) => {
    if (MESH_ASTEROID_BODIES.has(number)) return;
    const name = asteroidNameAt(names, j);
    rows.push({
      id: encodeAsteroidFocusId(number),
      class: 'catalog',
      names: [asteroidLabel(number, name), name],
      chip: 'Asteroid',
    });
  });
  yield rows;
}

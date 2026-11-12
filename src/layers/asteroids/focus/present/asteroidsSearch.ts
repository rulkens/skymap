/**
 * asteroidsSearch — one palette row per named asteroid, yielded once the catalog has loaded
 * (opening the palette loads it, `asteroidsAssetRows`). The unnamed majority is reachable by pick and
 * link only. The bare name rides beside `(433) Eros` so typing "Eros" is an exact match.
 */
import { encodeAsteroidFocusId } from './encodeAsteroidFocusId';
import { asteroidLabel } from '../../selection/present/asteroidLabel';
import { asteroidNameAt } from '../../catalog/utils/asteroidNameAt';
import { MESH_ASTEROID_NUMBERS } from '../../catalog/data/meshAsteroidNumbers';
import type { LayerSearchEntry } from '../../../../@types/engine/layer/LayerSearchEntry';
import type { LoadedAsteroids } from '../../catalog/@types/LoadedAsteroids';
import type { AsteroidsRuntime } from '../../@types/AsteroidsRuntime';

const loaded = (runtime: AsteroidsRuntime): Promise<LoadedAsteroids> =>
  new Promise((resolve) => {
    const check = (): boolean => {
      const value = runtime.slot.current();
      if (value !== null) resolve(value);
      return value !== null;
    };
    if (check()) return;
    const unsubscribe = runtime.slot.subscribe(() => {
      if (check()) unsubscribe();
    });
  });

export async function* asteroidsSearch(
  runtime: AsteroidsRuntime,
): AsyncIterable<readonly LayerSearchEntry[]> {
  const { names } = await loaded(runtime);
  const rows: LayerSearchEntry[] = [];
  names.numbers.forEach((number, j) => {
    if (MESH_ASTEROID_NUMBERS.includes(number)) return;
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

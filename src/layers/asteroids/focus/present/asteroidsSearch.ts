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
import type { LoadState } from '../../../../@types/loading/LoadState';
import type { AsteroidsRuntime } from '../../@types/AsteroidsRuntime';

/** The committed catalog, or null if the slot errors or is released before one lands. */
const loaded = (runtime: AsteroidsRuntime): Promise<LoadedAsteroids | null> =>
  new Promise((resolve) => {
    const now = runtime.slot.current();
    if (now !== null) return resolve(now);
    const unsubscribe = runtime.slot.subscribe((state: LoadState<LoadedAsteroids>) => {
      const value = runtime.slot.current();
      if (value === null && state.kind !== 'error' && state.kind !== 'idle') return;
      unsubscribe();
      resolve(value);
    });
  });

export async function* asteroidsSearch(
  runtime: AsteroidsRuntime,
): AsyncIterable<readonly LayerSearchEntry[]> {
  const catalog = await loaded(runtime);
  if (catalog === null) return;
  const { names } = catalog;
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

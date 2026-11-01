/**
 * satellitesSearch — the palette rows for every satellite in the day's catalog, yielded once the
 * catalog has loaded (opening the palette loads it, `satellitesAssetRows`). `catalog` rows, so
 * they share the cap with the galaxy aliases instead of flooding a short query. A query matches a
 * name verbatim, so the COSPAR designator rides beside CelesTrak's name.
 */
import { encodeSatelliteFocusId } from './encodeSatelliteFocusId';
import type { LayerSearchEntry } from '../../../@types/engine/layer/LayerSearchEntry';
import type { SatelliteCatalog } from '../../../@types/satellites/SatelliteCatalog';
import type { SatellitesRuntime } from '../@types/SatellitesRuntime';

const loadedCatalog = (runtime: SatellitesRuntime): Promise<SatelliteCatalog> =>
  new Promise((resolve) => {
    const check = (): boolean => {
      const catalog = runtime.propagator.catalog();
      if (catalog !== null) resolve(catalog);
      return catalog !== null;
    };
    if (check()) return;
    const unsubscribe = runtime.slot.subscribe(() => {
      if (check()) unsubscribe();
    });
  });

export async function* satellitesSearch(
  runtime: SatellitesRuntime,
): AsyncIterable<readonly LayerSearchEntry[]> {
  const catalog = await loadedCatalog(runtime);
  yield Array.from(catalog.noradId, (noradId, k) => ({
    id: encodeSatelliteFocusId(noradId),
    class: 'catalog' as const,
    names: catalog.cosparIds[k] ? [catalog.names[k]!, catalog.cosparIds[k]!] : [catalog.names[k]!],
  }));
}

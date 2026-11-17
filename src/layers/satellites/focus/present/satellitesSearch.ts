/**
 * satellitesSearch — the palette rows for every satellite in the day's catalog, yielded once the
 * catalog has loaded (opening the palette loads it, `satellitesAssetRows`); none if the load fails
 * or is released. `catalog` rows, so they share the cap with the galaxy aliases instead of flooding
 * a short query. A query matches a name verbatim, so the COSPAR designator rides beside CelesTrak's
 * name.
 */
import { encodeSatelliteFocusId } from './encodeSatelliteFocusId';
import { awaitSlotValue } from '../../../../utils/loading/awaitSlotValue';
import type { LayerSearchEntry } from '../../../../@types/engine/layer/LayerSearchEntry';
import type { SatellitesRuntime } from '../../@types/SatellitesRuntime';

export async function* satellitesSearch(
  runtime: SatellitesRuntime,
): AsyncIterable<readonly LayerSearchEntry[]> {
  // The slot's commit starts the propagator, which holds the parsed catalog.
  const catalog = (await awaitSlotValue(runtime.slot)) && runtime.propagator.catalog();
  if (!catalog) return;
  yield Array.from(catalog.noradId, (noradId, k) => ({
    id: encodeSatelliteFocusId(noradId),
    class: 'catalog' as const,
    names: catalog.cosparIds[k] ? [catalog.names[k]!, catalog.cosparIds[k]!] : [catalog.names[k]!],
  }));
}

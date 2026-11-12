/**
 * The Layer's two asset rows. The catalog loads a little outside the `solarSystem` band's out edge,
 * so it is resident before the first dot shows, and the palette lifts it so a search works from
 * anywhere. The names file waits for the palette and is never fetched with the catalog.
 */
import type { AssetWiringRow } from '../../../../@types/loading/AssetWiringRow';
import type { AsteroidsAssetKey } from '../../@types/AsteroidsAssetKey';
import type { AsteroidsRuntime } from '../../@types/AsteroidsRuntime';

export function asteroidsAssetRows(
  runtime: AsteroidsRuntime,
): readonly AssetWiringRow<unknown, unknown, AsteroidsAssetKey>[] {
  return [
    {
      key: 'asteroids',
      slot: runtime.slot,
      req: () => undefined,
      demand: {
        shown: 'asteroids',
        near: { band: 'solarSystem', edge: 'out', lead: 1.5, release: 2.5 },
        alsoWhen: ['searching'],
      },
      priority: 86, // next free rung after stellar streams (85)
      // No `gates`: one file holds every class, and a gate names one item's whole data.
    },
    {
      key: 'asteroidNames',
      slot: runtime.namesSlot,
      req: () => undefined,
      demand: 'whenSearching',
      priority: 87, // behind the catalog, which a found name needs before it can be placed
    },
  ];
}

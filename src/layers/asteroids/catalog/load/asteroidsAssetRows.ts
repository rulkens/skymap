/**
 * The Layer's one asset row (the names file rides in the same slot). It loads a little outside the
 * `solarSystem` band's out edge, so it is resident before the first dot shows; the palette and an
 * asteroid selection lift it, so a search or a deep link works from anywhere.
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
  ];
}

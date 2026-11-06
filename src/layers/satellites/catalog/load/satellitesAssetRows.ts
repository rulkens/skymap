/**
 * The Layer's one asset row, gated on the `nearEarth` band's out edge, measured from Earth's
 * live position (spec §5.5). The selection arm lets a deep link to a satellite resolve from far
 * away, once `watchSelectionRevealSaga` has switched the section on.
 */
import type { AssetWiringRow } from '../../../../@types/loading/AssetWiringRow';
import type { SatellitesAssetKey } from '../../@types/SatellitesAssetKey';
import type { SatellitesRuntime } from '../../@types/SatellitesRuntime';

export function satellitesAssetRows(
  runtime: SatellitesRuntime,
): readonly AssetWiringRow<unknown, unknown, SatellitesAssetKey>[] {
  return [
    {
      key: 'satellites',
      slot: runtime.slot,
      req: () => undefined,
      demand: {
        shown: 'satellites',
        near: { band: 'nearEarth', edge: 'out', lead: 1.5, release: 2.5 },
        alsoWhen: ['searching', 'selected'],
      },
      priority: 84, // next free rung after the Local Bubble (83)
      // No `gates`: one file holds every class, and a gate names one item's whole data. The pass
      // draws nothing until a sweep lands, so the dots still wait for the catalog.
    },
  ];
}

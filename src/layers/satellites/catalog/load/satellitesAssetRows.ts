/**
 * The Layer's one asset row: demand while a class is shown and the camera is near Earth, the
 * palette is open or a satellite is selected; release when every class is off or none of those
 * holds (spec §5.5). Near Earth is the `nearEarth` band's out edge (600,000 km, measured from
 * Earth's live position): load inside 1.5x it, release past 2.5x, so hovering at the edge does
 * not thrash. The selection arm (`selectedKinds`, set as soon as a link's ref lands) is what lets
 * a deep link to a satellite resolve from far away, once `watchSelectionRevealSaga` has switched
 * the section on; core's selection wake re-runs this demand.
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
      // An open palette loads it too, so a satellite can be searched for from anywhere.
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

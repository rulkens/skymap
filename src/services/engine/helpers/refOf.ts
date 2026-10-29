/**
 * refOf — maps a resolved `FocusableTarget` to its identity `SelectionRef`.
 *
 * The boundary from the rich display model to the serializable `selection`-slice ref (e.g. the
 * InfoCard Focus button dispatching `updateSelectionFocus`).
 *
 * `GalaxyInfo.source` is the wider `SourceType`, but a displayed galaxy always came from a
 * galaxy catalog source, so the `GalaxyCatalogSourceType` cast is correct here.
 */
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { GalaxyCatalogSourceType } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { GalaxyInfo } from '../../../@types/engine/GalaxyInfo';
import type { StructureInfo } from '../../../@types/data/structure/StructureInfo';
import type { MilkyWayInfo } from '../../../@types/engine/MilkyWayInfo';
import type { ZoneOfAvoidanceInfo } from '../../../@types/engine/ZoneOfAvoidanceInfo';
import type { BodyInfo } from '../../../@types/engine/BodyInfo';
import type { CraftInfo } from '../../../@types/engine/CraftInfo';
import type { EarthSceneInfo } from '../../../@types/engine/EarthSceneInfo';
import type { StarInfo } from '../../../@types/engine/StarInfo';
import type { BlackHoleInfo } from '../../../@types/engine/BlackHoleInfo';
import type { SatelliteInfo } from '../../../@types/engine/SatelliteInfo';

const REF_OF: {
  galaxyCatalog: (t: GalaxyInfo) => SelectionRef;
  structure: (t: StructureInfo) => SelectionRef;
  milkyWay: (t: MilkyWayInfo) => SelectionRef;
  zoneOfAvoidance: (t: ZoneOfAvoidanceInfo) => SelectionRef;
  body: (t: BodyInfo) => SelectionRef;
  craft: (t: CraftInfo) => SelectionRef;
  earthScene: (t: EarthSceneInfo) => SelectionRef;
  starCatalog: (t: StarInfo) => SelectionRef;
  blackHole: (t: BlackHoleInfo) => SelectionRef;
  satellite: (t: SatelliteInfo) => SelectionRef;
} = {
  galaxyCatalog: (t) => ({
    type: 'galaxyCatalog',
    source: t.source as GalaxyCatalogSourceType,
    index: t.index,
  }),
  structure: (t) => ({ type: 'structure', id: t.id }),
  milkyWay: () => ({ type: 'milkyWay' }),
  zoneOfAvoidance: () => ({ type: 'zoneOfAvoidance' }),
  body: (t) => ({ type: 'body', id: t.id }),
  craft: (t) => ({ type: 'craft', id: t.id }),
  earthScene: (t) => ({ type: 'earthScene', id: t.id }),
  // The durable seed id rides the row, not the ref.
  starCatalog: (t) => ({ type: 'starCatalog', source: t.source, index: t.index }),
  blackHole: (t) => ({ type: 'blackHole', id: t.id }),
  satellite: (t) => ({ type: 'satellite', noradId: t.noradId }),
};

export function refOf(target: FocusableTarget): SelectionRef {
  return (REF_OF[target.type] as (t: FocusableTarget) => SelectionRef)(target);
}

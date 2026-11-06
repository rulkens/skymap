import type { DriverGeometry } from './camera/DriverGeometry';
import type { GalaxyRow } from './GalaxyRow';
import type { StructureInfo } from '../data/structure/StructureInfo';
import type { StarCatalogSourceType } from '../../layers/starCatalog/@types/StarCatalogSourceType';
import type { BodyInfo } from './BodyInfo';
import type { CraftInfo } from './CraftInfo';
import type { EarthSceneInfo } from './EarthSceneInfo';
import type { BlackHoleInfo } from './BlackHoleInfo';
import type { SatelliteInfo } from './SatelliteInfo';
import type { Vec3 } from '../math/Vec3';
import type { PlacedRow } from './selection/PlacedRow';
import type { FamousStarMetaEntry } from '../loading/FamousStarMetaEntry';

/**
 * SelectionRow — the serializable display projection of a selected thing, held in the
 * saga-owned `selectionRows` cache. The galaxy arm is the small `GalaxyRow` (its kind's
 * `toFocusable` builds the `GalaxyInfo` React-side). The `label` rides the row, not the async meta sidecar,
 * so a star's name shows before the JSON loads.
 *
 * `driver` rides only camera-hosting arms (`DrivenSelectionRow`), filled by the arm's
 * `extractRow`; readers use `selectionDriver`. Every arm must stay JSON-serializable
 * (`GalaxyRow.objId` is a string) so the RTK serializability check stays on. Every focusable
 * arm is a `PlacedRow`: its own fields stay for its Layer, the placement is what core reads.
 */
export type SelectionRow =
  | (GalaxyRow & PlacedRow)
  | (StructureInfo & PlacedRow)
  | ({ readonly type: 'milkyWay' } & PlacedRow)
  | { readonly type: 'zoneOfAvoidance' }
  | (BodyInfo & { readonly driver: DriverGeometry } & PlacedRow)
  | (CraftInfo & { readonly driver: DriverGeometry } & PlacedRow)
  | (EarthSceneInfo & { readonly driver: DriverGeometry } & PlacedRow)
  // Star arm: fields snapshotted at extract time. `id` is the seed id the `star-<seedId>` URL
  // needs; null for a survey star (which drives with a null `poseId`).
  | ({
      readonly type: 'starCatalog';
      readonly source: StarCatalogSourceType;
      readonly index: number;
      readonly id: string | null;
      readonly label: string;
      readonly positionMpc: Vec3;
      // Photosphere radius; the nominal solar radius for a survey star (the bin carries no size).
      readonly radiusM: number;
      // Survey-only; a seeded star's card reads `famous` or its orbit instead.
      readonly absMag?: number;
      readonly bpRp?: number;
      // A seeded star's curated sidecar entry, joined at extract time like `GalaxyRow.famous`;
      // absent while the sidecar loads and for a star it omits.
      readonly famous?: FamousStarMetaEntry;
      readonly driver: DriverGeometry;
    } & PlacedRow)
  // A black hole poses from its PLACE (`driver.poseId`), not a body table.
  | (BlackHoleInfo & { readonly driver: DriverGeometry } & PlacedRow)
  // A satellite poses from the position core re-extracts each frame (`placeLiveSelection`).
  | (SatelliteInfo & { readonly driver: DriverGeometry } & PlacedRow);

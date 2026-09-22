import type { GalaxyRow } from './GalaxyRow';
import type { StructureInfo } from '../data/structure/StructureInfo';
import type { StarCatalogSourceType } from '../data/starCatalog/StarCatalogSourceType';
import type { Vec3 } from '../math/Vec3';

/**
 * SelectionRow — the serializable DISPLAY projection of a selected thing, held
 * in the saga-owned `selectionRows` derived cache. The galaxy arm is the small
 * `GalaxyRow` (built React-side into a `GalaxyInfo` by `buildFocusable`); the
 * structure arm is the already-serializable `StructureInfo` record used as-is;
 * the Milky Way and the zone of avoidance are each the singleton tag; the body
 * arm carries a seeded scene body's identity, label and live position only. It
 * carries NO size (see `MeshBody.boundingRadiusM`); whoever needs a number
 * resolves the seed by `id` against `SCENE_BODIES` and reads the arm it
 * actually got. The `label` rides the row (not the async
 * meta sidecar) so a star's name shows the instant it is selected, before the
 * JSON has loaded.
 *
 * Every arm is JSON-serializable (`GalaxyRow.objId` is a string,
 * `StructureInfo` is a plain record, the body arm is flat numbers + strings),
 * so the RTK serializability check stays on.
 */
export type SelectionRow =
  | GalaxyRow
  | StructureInfo
  | { readonly type: 'milkyWay' }
  | { readonly type: 'zoneOfAvoidance' }
  | {
      readonly type: 'body';
      readonly id: string;
      readonly label: string;
      readonly positionMpc: Vec3;
    }
  // Star arm — the self-contained display projection of a picked star from any
  // of the four catalogs, its physical fields snapshotted at extract time so
  // framing and card read them directly. `source` + `index` come from the ref
  // (so `buildFocusable` can rebuild it, as GalaxyRow's index does); `id` is the
  // durable seed id the `star-<seedId>` URL and the camera's driver lookup need,
  // null for a survey star, which has no identity of its own.
  | {
      readonly type: 'starCatalog';
      readonly source: StarCatalogSourceType;
      readonly index: number;
      readonly id: string | null;
      readonly label: string;
      readonly positionMpc: Vec3;
      // A seeded star's photosphere; for a survey star the nominal solar radius,
      // since the bin quantises position + photometry only and carries no size.
      // The one radius framing (bodyLikeFraming), the halo and the sphere gate read.
      readonly radiusM: number;
      // Survey-only catalogued photometry — a seeded star's card reads its
      // curated sidecar or its orbit instead.
      readonly absMag?: number;
      readonly bpRp?: number;
    };

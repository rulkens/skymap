import type { GalaxyRow } from './GalaxyRow';
import type { StructureInfo } from '../data/structure/StructureInfo';
import type { Vec3 } from '../math/Vec3';

/**
 * SelectionRow — the serializable DISPLAY projection of a selected thing, held
 * in the saga-owned `selectionRows` derived cache. The galaxy arm is the small
 * `GalaxyRow` (built React-side into a `GalaxyInfo` by `buildFocusable`); the
 * structure arm is the already-serializable `StructureInfo` record used as-is;
 * the Milky Way and the zone of avoidance are each the singleton tag; the body
 * arm carries a seeded scene body's
 * label, position + physical radius (the fields the InfoCard headline shows and
 * `focusFraming` frames on), snapshotted off the static `SCENE_BODIES` table at
 * extract time — like the structure arm, the row is self-contained so
 * downstream framing reads its fields directly rather than re-looking-up the
 * seed. The `label` rides the row (not the async meta sidecar) so a star's name
 * shows the instant it is selected, before the JSON has loaded.
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
      readonly radiusM: number;
      // Carried through from `AnchorPointBody.standoffRadii` (e.g. Sgr A*'s
      // Q10 floor) — the zoom clamp reads it via `pivotStandoffRadii`.
      readonly standoffRadii?: number;
    }
  // Star arm — the self-contained display projection of a picked star, its
  // physical fields (`positionMpc`/`absMag`/`bpRp`) snapshotted off the loaded
  // StarCatalog at extract time so framing/card read them directly. It also
  // carries `index` (from the ref) so `buildFocusable` can rebuild the ref /
  // the `star-<index>` URL, mirroring how GalaxyRow carries its index.
  | {
      readonly type: 'star';
      readonly index: number;
      readonly positionMpc: Vec3;
      readonly absMag: number;
      readonly bpRp: number;
      // Nominal solar radius (km), stamped by the extractor. The bin quantises
      // position + photometry only, so a field star carries no measured size;
      // this representative radius is the one framing (bodyLikeFraming) and the
      // sphere gate read for a discrete near-field star.
      readonly radiusM: number;
    };

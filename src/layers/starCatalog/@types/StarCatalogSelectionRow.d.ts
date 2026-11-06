import type { StarCatalogSourceType } from './StarCatalogSourceType';
import type { DriverGeometry } from '../../../@types/engine/camera/DriverGeometry';
import type { PlacedRow } from '../../../@types/engine/selection/PlacedRow';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { FamousStarMetaEntry } from '../../../@types/loading/FamousStarMetaEntry';

/**
 * A star's row, fields snapshotted at extract time. `id` is the seed id the `star-<seedId>` URL
 * needs; null for a survey star, which drives with a null `poseId`. The `label` rides the row,
 * not the async sidecar, so a star's name shows before the JSON loads.
 */
export type StarCatalogSelectionRow = {
  readonly type: 'starCatalog';
  readonly source: StarCatalogSourceType;
  readonly index: number;
  readonly id: string | null;
  readonly label: string;
  readonly positionMpc: Vec3;
  /** Photosphere radius; the nominal solar radius for a survey star (the bin carries no size). */
  readonly radiusM: number;
  /** Survey-only; a seeded star's card reads `famous` or its orbit instead. */
  readonly absMag?: number;
  readonly bpRp?: number;
  /** A seeded star's curated sidecar entry, joined at extract time like `GalaxyRow.famous`;
   * absent while the sidecar loads and for a star it omits. */
  readonly famous?: FamousStarMetaEntry;
  readonly driver: DriverGeometry;
} & PlacedRow;

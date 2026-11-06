import type { EarthSceneInfo } from '../../../@types/engine/EarthSceneInfo';
import type { DriverGeometry } from '../../../@types/engine/camera/DriverGeometry';
import type { PlacedRow } from '../../../@types/engine/selection/PlacedRow';

export type EarthSceneSelectionRow = EarthSceneInfo & {
  readonly driver: DriverGeometry;
} & PlacedRow;

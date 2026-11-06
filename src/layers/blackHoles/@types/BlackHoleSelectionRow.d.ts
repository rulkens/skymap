import type { BlackHoleInfo } from '../../../@types/engine/BlackHoleInfo';
import type { DriverGeometry } from '../../../@types/engine/camera/DriverGeometry';
import type { PlacedRow } from '../../../@types/engine/selection/PlacedRow';

/** A black hole poses from its PLACE (`driver.poseId`), not a body table. */
export type BlackHoleSelectionRow = BlackHoleInfo & { readonly driver: DriverGeometry } & PlacedRow;

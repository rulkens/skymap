import type { SatelliteInfo } from '../../../../@types/engine/SatelliteInfo';
import type { DriverGeometry } from '../../../../@types/engine/camera/DriverGeometry';
import type { PlacedRow } from '../../../../@types/engine/selection/PlacedRow';

/** Poses from the position core re-extracts each frame (`placeLiveSelection`). */
export type SatelliteSelectionRow = SatelliteInfo & { readonly driver: DriverGeometry } & PlacedRow;

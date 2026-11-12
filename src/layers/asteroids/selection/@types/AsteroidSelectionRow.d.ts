import type { AsteroidInfo } from './AsteroidInfo';
import type { DriverGeometry } from '../../../../@types/engine/camera/DriverGeometry';
import type { PlacedRow } from '../../../../@types/engine/selection/PlacedRow';

/** Poses from the position core re-extracts each frame (`placeLiveSelection`). */
export type AsteroidSelectionRow = AsteroidInfo & { readonly driver: DriverGeometry } & PlacedRow;

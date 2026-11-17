import type { CraftInfo } from '../../../../@types/engine/CraftInfo';
import type { DriverGeometry } from '../../../../@types/engine/camera/DriverGeometry';
import type { PlacedRow } from '../../../../@types/engine/selection/PlacedRow';

export type CraftSelectionRow = CraftInfo & { readonly driver: DriverGeometry } & PlacedRow;

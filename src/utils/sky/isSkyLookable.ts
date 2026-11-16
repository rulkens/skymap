/**
 * isSkyLookable — whether a standing person can turn their head to a selection row: it has a
 * place in the sky and is not the ground they stand on (`isUnderfoot`).
 */

import { isUnderfoot } from './isUnderfoot';
import type { PlacedRow } from '../../@types/engine/selection/PlacedRow';
import type { SelectionRowBase } from '../../@types/engine/selection/SelectionRowBase';
import type { SkySpot } from '../../@types/camera/pose/SkySpot';

export function isSkyLookable(
  row: SelectionRowBase | null,
  spot: SkySpot,
): row is SelectionRowBase & PlacedRow {
  return row !== null && 'positionMpc' in row && !isUnderfoot(row, spot);
}

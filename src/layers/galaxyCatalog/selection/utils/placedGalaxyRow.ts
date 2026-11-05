import { SCALE_UNITS } from '../../../../data/scaleUnits';
import type { GalaxyRow } from '../../../../@types/engine/GalaxyRow';
import type { SelectionRow } from '../../../../@types/engine/SelectionRow';

/** The diameter a galaxy with no usable measurement frames and rings at. */
const FALLBACK_DIAMETER_KPC = 30;

/** A galaxy's selection row: the record plus the placement core frames and rings it by. */
export function placedGalaxyRow(row: GalaxyRow): Extract<SelectionRow, { type: 'galaxyCatalog' }> {
  const diameterKpc =
    Number.isFinite(row.diameterKpc) && row.diameterKpc > 0
      ? row.diameterKpc
      : FALLBACK_DIAMETER_KPC;
  return {
    ...row,
    positionMpc: [row.x, row.y, row.z],
    radiusMpc: (diameterKpc / 2) * SCALE_UNITS.KPC_TO_MPC,
  };
}

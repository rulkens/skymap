import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { FALLBACK_DIAMETER_KPC } from '../../appearance/data/fallbackDiameterKpc';
import type { GalaxyRow } from '../../records/@types/GalaxyRow';
import type { GalaxyCatalogSelectionRow } from '../@types/GalaxyCatalogSelectionRow';

/** A galaxy's selection row: the record plus the placement core frames and rings it by. */
export function placedGalaxyRow(row: GalaxyRow): GalaxyCatalogSelectionRow {
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

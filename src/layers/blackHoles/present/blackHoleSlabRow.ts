/**
 * blackHoleSlabRow — the slab row its lens pass draws on, posed from the PLACE
 * (`anchorId`) so the pose key is the Galactic Centre whatever sits there. The
 * drawn extent is the lensed sphere and 0 outside the band, so culling and
 * `activeBand` agree; the footprint is r_s, which arrival and the floor multiply.
 */

import type { SlabRow } from '../../../@types/engine/frame/SlabRow';
import type { BlackHoleRow } from '../@types/BlackHoleRow';
import { schwarzschildRadiusM } from '../../../utils/physics/schwarzschildRadiusM';
import { sgrAStarLensEnvelopeM } from '../../../data/bodies/sgrAStarLensEnvelope';

export function blackHoleSlabRow(row: BlackHoleRow): SlabRow {
  return {
    anchorId: row.anchorId,
    drawRadiusM: sgrAStarLensEnvelopeM,
    footprintRadiusM: schwarzschildRadiusM(row.massSolar),
    activeBand: row.band,
    source: 'lens',
  };
}

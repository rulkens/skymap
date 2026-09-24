/**
 * blackHoleSlabRow — a black hole's `body-m` slab row, the host its lens pass
 * draws on. Posed from the PLACE (`anchorId`), not a body, so the pose key is
 * the Galactic Centre whatever sits there.
 *
 * The drawn extent IS the lensed sphere, and it is 0 outside the band, so the
 * roster culls and `activeBand` agree by construction — no bypass needed. The
 * footprint is r_s, the occupied sphere: arrival and the descent floor are
 * multiples of it.
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

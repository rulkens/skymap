/**
 * blackHoleSlabRow — the slab row its lens pass draws on, posed from the PLACE
 * (`anchorId`) so the pose key is the Galactic Centre whatever sits there. The
 * drawn extent is the lensed sphere and 0 outside the band, so culling and
 * `activeBand` agree; the footprint is r_s, which arrival and the floor multiply.
 */

import type { SlabRow } from '../../../@types/engine/frame/SlabRow';
import type { BlackHoleRow } from '../@types/BlackHoleRow';
import { CUBEMAP_CAPTURES } from '../../../data/rendering/cubemapCaptures';
import { schwarzschildRadiusM } from '../../../utils/physics/schwarzschildRadiusM';
import { blackHoleAnchorId } from './blackHoleAnchorId';
import { blackHoleLensEnvelopeM } from './blackHoleLensEnvelopeM';

export function blackHoleSlabRow(row: BlackHoleRow): SlabRow {
  return {
    anchorId: blackHoleAnchorId(row),
    drawRadiusM: blackHoleLensEnvelopeM(row),
    footprintRadiusM: schwarzschildRadiusM(row.massSolar),
    activeBand: CUBEMAP_CAPTURES[row.capture].band,
    source: 'lens',
  };
}

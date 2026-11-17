/**
 * blackHoleSlabRow — the slab row its lens pass draws on, posed from the PLACE
 * (`anchorId`) so the pose key is the Galactic Centre whatever sits there. The
 * drawn extent is the lensed sphere and 0 outside the band, so culling and
 * `activeBand` agree; the footprint is r_s, which arrival and the floor multiply.
 */

import type { SlabRow } from '../../../../@types/engine/frame/SlabRow';
import type { BlackHoleRow } from '../../@types/BlackHoleRow';
import { BLACK_HOLE_SKY_CAPTURES } from '../../lensing/data/blackHoleSkyCaptures';
import { schwarzschildRadiusM } from '../../../../utils/physics/schwarzschildRadiusM';
import { blackHoleAnchorId } from './blackHoleAnchorId';
import { blackHoleLensEnvelopeM } from '../../lensing/present/blackHoleLensEnvelopeM';

export function blackHoleSlabRow(row: BlackHoleRow): SlabRow {
  return {
    anchorId: blackHoleAnchorId(row),
    drawRadiusM: blackHoleLensEnvelopeM(row),
    footprintRadiusM: schwarzschildRadiusM(row.massSolar),
    activeBand: BLACK_HOLE_SKY_CAPTURES[row.capture].band,
    hosts: [{ line: 'lens' }],
  };
}

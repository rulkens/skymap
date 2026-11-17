import { apparentMagnitudeFromAbs } from '../../../../utils/star/apparentMagnitudeFromAbs';
import { spectralClassFromBpRp } from '../../../../utils/star/spectralClassFromBpRp';
import { sStarOrbitInfo } from '../../../../data/bodies/sStarOrbitInfo';
import type { StarInfoDetail } from '../../@types/StarInfoDetail';
import type { StarCatalogSelectionRow } from '../@types/StarCatalogSelectionRow';

/**
 * Which block the star card renders, keyed on the row's own shape: catalogued photometry (the
 * survey bin quantises position + Gaia photometry and nothing else), a compiled-in orbit, or
 * nothing. A seeded star's curated sidecar entry is joined by the card's container instead.
 */
export function starDetail(row: StarCatalogSelectionRow, distancePc: number): StarInfoDetail {
  if (row.absMag !== undefined && row.bpRp !== undefined) {
    return {
      kind: 'photometry',
      absMag: row.absMag,
      apparentMag: apparentMagnitudeFromAbs(row.absMag, distancePc),
      bpRp: row.bpRp,
      spectralClass: spectralClassFromBpRp(row.bpRp),
    };
  }
  if (row.id === null) return { kind: 'none' };
  const orbit = sStarOrbitInfo(row.id);
  return orbit ? { kind: 'orbit', orbit } : { kind: 'none' };
}

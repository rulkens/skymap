import { apparentMagnitudeFromAbs } from '../../../../utils/star/apparentMagnitudeFromAbs';
import { spectralClassFromBpRp } from '../../../../utils/star/spectralClassFromBpRp';
import { sStarOrbitInfo } from '../../../../data/bodies/sStarOrbitInfo';
import type { SelectionRow } from '../../../../@types/engine/SelectionRow';
import type { StarInfoDetail } from '../../../../@types/engine/StarInfoDetail';

/**
 * Which block the star card renders, keyed on the row's own shape: catalogued photometry (the
 * survey bin quantises position + Gaia photometry and nothing else), a curated sidecar entry, a
 * compiled-in orbit, or nothing. A row extracted before the sidecar lands has no `famous`, so
 * "still loading" and "no entry" share the one fail-soft path.
 */
export function starDetail(
  row: Extract<SelectionRow, { type: 'starCatalog' }>,
  distancePc: number,
): StarInfoDetail {
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
  if (row.famous) return { kind: 'curated', meta: row.famous };
  const orbit = sStarOrbitInfo(row.id);
  return orbit ? { kind: 'orbit', orbit } : { kind: 'none' };
}

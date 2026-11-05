import { apparentMagnitudeFromAbs } from '../../../../utils/star/apparentMagnitudeFromAbs';
import { spectralClassFromBpRp } from '../../../../utils/star/spectralClassFromBpRp';
import { sStarOrbitInfo } from '../../../../data/bodies/sStarOrbitInfo';
import type { SelectionRow } from '../../../../@types/engine/SelectionRow';
import type { FamousStarMetaEntry } from '../../../../@types/loading/FamousStarMetaEntry';
import type { StarInfoDetail } from '../../../../@types/engine/StarInfoDetail';

/**
 * Which block the star card renders, keyed on the row's own shape: catalogued photometry (the
 * survey bin quantises position + Gaia photometry and nothing else), a curated sidecar entry, a
 * compiled-in orbit, or nothing. The sidecar joins here, not in the card, so one fail-soft path
 * covers "sidecar still loading" and "no entry".
 */
export function starDetail(
  row: Extract<SelectionRow, { type: 'starCatalog' }>,
  distancePc: number,
  famousStarsMeta: readonly FamousStarMetaEntry[],
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
  const meta = famousStarsMeta.find((entry) => entry.id === row.id);
  if (meta) return { kind: 'curated', meta };
  const orbit = sStarOrbitInfo(row.id);
  return orbit ? { kind: 'orbit', orbit } : { kind: 'none' };
}

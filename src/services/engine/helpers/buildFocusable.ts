/**
 * buildFocusable — the pure, React-side build of the FocusableTarget view-model from a stored
 * SelectionRow, table-dispatched on the row tag. The body and black-hole arms are their Info
 * minus the camera `driver`. One `StarInfo` serves every star; its `detail` block follows what
 * the star HAS, not its catalog.
 *
 * `famousStarsMeta` joins here, not in the card, so the card stays presentational and one
 * fail-soft path covers "sidecar still loading" and "no entry". Imports only pure builders and
 * static tables, so a memoized selector can call it without reaching the engine.
 */
import { buildGalaxyInfo } from './buildGalaxyInfo';
import { MILKY_WAY_INFO } from '../../../data/milkyWay/milkyWayInfo';
import { ZONE_OF_AVOIDANCE_INFO } from '../../../data/zoneOfAvoidance/zoneOfAvoidanceInfo';
import { sStarOrbitInfo } from '../../../data/bodies/sStarOrbitInfo';
import { apparentMagnitudeFromAbs } from '../../../utils/star/apparentMagnitudeFromAbs';
import { spectralClassFromBpRp } from '../../../utils/star/spectralClassFromBpRp';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import type { FamousStarMetaEntry } from '../../../@types/loading/FamousStarMetaEntry';
import type { StarInfo } from '../../../@types/engine/StarInfo';
import type { StarInfoDetail } from '../../../@types/engine/StarInfoDetail';

/**
 * Which block the card renders, keyed on the row's own shape: catalogued
 * photometry (the survey bin quantises position + Gaia photometry and nothing
 * else), a curated sidecar entry, a compiled-in orbit, or nothing.
 */
function starDetail(
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

const BUILD_FOCUSABLE: {
  [K in SelectionRow['type']]: (
    row: Extract<SelectionRow, { type: K }>,
    famousStarsMeta: readonly FamousStarMetaEntry[],
  ) => FocusableTarget | null;
} = {
  galaxyCatalog: (row) => buildGalaxyInfo(row),
  structure: (row) => row,
  milkyWay: () => MILKY_WAY_INFO,
  zoneOfAvoidance: () => ZONE_OF_AVOIDANCE_INFO,
  body: ({ driver: _driver, ...info }) => info,
  craft: ({ driver: _driver, ...info }) => info,
  earthScene: ({ driver: _driver, ...info }) => info,
  starCatalog: (row, famousStarsMeta): StarInfo => {
    const [x, y, z] = row.positionMpc;
    const distancePc = Math.hypot(x, y, z) / SCALE_UNITS.PC_TO_MPC;
    return {
      type: 'starCatalog',
      source: row.source,
      index: row.index,
      id: row.id,
      displayName: row.label,
      x,
      y,
      z,
      distancePc,
      detail: starDetail(row, distancePc, famousStarsMeta),
    };
  },
  blackHole: ({ driver: _driver, ...info }) => info,
  satellite: ({ driver: _driver, ...info }) => info,
};

export function buildFocusable(
  row: SelectionRow | null,
  famousStarsMeta: readonly FamousStarMetaEntry[],
): FocusableTarget | null {
  if (row === null) return null;
  return (
    BUILD_FOCUSABLE[row.type] as (
      r: SelectionRow,
      meta: readonly FamousStarMetaEntry[],
    ) => FocusableTarget | null
  )(row, famousStarsMeta);
}

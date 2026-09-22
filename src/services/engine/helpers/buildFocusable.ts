/**
 * buildFocusable — the pure, React-side build of the FocusableTarget view-model
 * from a stored SelectionRow. Table-dispatched on the row tag: the galaxy arm
 * runs buildGalaxyInfo (the pure formatter); the structure arm IS already a
 * StructureInfo so it passes through; the Milky Way arm is the singleton const;
 * the body arm builds a `BodyInfo` for Earth, a planet or a mesh body; the star
 * arm builds one `StarInfo` for every star, survey or seeded, whose `detail`
 * block is chosen by what the star HAS rather than by its catalog.
 *
 * `famousStarsMeta` is joined in here rather than read by the card, the way the
 * galaxy card's meta join happens at the selector: the card stays presentational
 * and one fail-soft path covers both "sidecar still loading" and "no entry".
 *
 * This imports only pure builders + static tables, so React can call it inside a
 * memoized selector without reaching the engine — the whole point of the
 * pure-store read.
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
import type { BodyInfo } from '../../../@types/engine/BodyInfo';
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
  body: (row): BodyInfo => ({
    type: 'body',
    id: row.id,
    label: row.label,
    positionMpc: row.positionMpc,
  }),
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
      radiusM: row.radiusM,
      detail: starDetail(row, distancePc, famousStarsMeta),
    };
  },
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

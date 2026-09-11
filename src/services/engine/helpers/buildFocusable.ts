/**
 * buildFocusable — the pure, React-side build of the FocusableTarget view-model
 * from a stored SelectionRow. Table-dispatched on the row tag: the galaxy arm
 * runs buildGalaxyInfo (the pure formatter); the structure arm IS already a
 * StructureInfo (a FocusableTarget arm) so it passes through; the Milky Way arm
 * is the singleton const; the body arm builds a `BodyInfo` for EVERY body row —
 * a famous star, Earth, a planet, an S-star — so any clicked/deep-linked scene
 * body drives the InfoCard and the `#focus=body-<id>` hash. (The card rows fill
 * in from the async famous-star meta only for the famous ids; a planet or Earth
 * renders BodyDetailCard's name + radius rows from the BodyInfo fields alone,
 * with no async lookup, and an S-star adds its orbital block from the
 * compiled-in seed table.) The star arm builds a
 * `FieldStarInfo` view-model for a picked survey star.
 *
 * This imports only pure builders + a static const/set, so React can call it
 * inside a memoized selector without reaching the engine — the whole point of
 * the pure-store read. It is the inverse of today's engine-bakes-GalaxyInfo
 * flow.
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
import type { FieldStarInfo } from '../../../@types/engine/FieldStarInfo';

const BUILD_FOCUSABLE: {
  [K in SelectionRow['type']]: (row: Extract<SelectionRow, { type: K }>) => FocusableTarget | null;
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
    radiusM: row.radiusM,
    // Undefined for every body with no elements. Looked up here rather than
    // carried on the stored row: five derived numbers off a compiled-in table
    // would be re-serialized into RTK state on every selection for no gain.
    orbit: sStarOrbitInfo(row.id),
  }),
  // A picked star has no per-star identity on the bin (SKST v1 quantises
  // position + Gaia photometry only), so the card is a small self-derived
  // view-model built here from the row's raw fields via the Task-1 helpers:
  // distance is |positionMpc| converted Mpc to pc, apparent magnitude follows
  // from the distance modulus, and the spectral class is binned off BP-RP.
  star: (row): FieldStarInfo => {
    const [x, y, z] = row.positionMpc;
    const distancePc = Math.hypot(x, y, z) / SCALE_UNITS.PC_TO_MPC;
    return {
      type: 'star',
      index: row.index,
      displayName: 'Field star',
      x,
      y,
      z,
      distancePc,
      absMag: row.absMag,
      apparentMag: apparentMagnitudeFromAbs(row.absMag, distancePc),
      bpRp: row.bpRp,
      spectralClass: spectralClassFromBpRp(row.bpRp),
    };
  },
};

export function buildFocusable(row: SelectionRow | null): FocusableTarget | null {
  if (row === null) return null;
  return (BUILD_FOCUSABLE[row.type] as (r: SelectionRow) => FocusableTarget | null)(row);
}

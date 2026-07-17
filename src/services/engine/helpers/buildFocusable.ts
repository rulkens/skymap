/**
 * buildFocusable — the pure, React-side build of the FocusableTarget view-model
 * from a stored SelectionRow. Table-dispatched on the row tag: the galaxy arm
 * runs buildGalaxyInfo (the pure formatter); the structure arm IS already a
 * StructureInfo (a FocusableTarget arm) so it passes through; the Milky Way arm
 * is the singleton const; the body arm maps to null — a scene body has no
 * InfoCard / URL-hash presence yet (search → camera focus only), so it never
 * becomes a FocusableTarget and every FocusableTarget consumer (InfoCard,
 * urlHashFor, targetIdentityKey) stays body-unaware by construction.
 *
 * This imports only pure builders + a static const, so React can call it inside
 * a memoized selector without reaching the engine — the whole point of the
 * pure-store read. It is the inverse of today's engine-bakes-GalaxyInfo flow.
 */
import { buildGalaxyInfo } from './buildGalaxyInfo';
import { MILKY_WAY_INFO } from '../../../data/milkyWay/milkyWayInfo';
import { apparentMagnitudeFromAbs } from '../../../utils/star/apparentMagnitudeFromAbs';
import { spectralClassFromBpRp } from '../../../utils/star/spectralClassFromBpRp';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import type { StarInfo } from '../../../@types/engine/StarInfo';

const BUILD_FOCUSABLE: {
  [K in SelectionRow['type']]: (row: Extract<SelectionRow, { type: K }>) => FocusableTarget | null;
} = {
  galaxyCatalog: (row) => buildGalaxyInfo(row),
  structure: (row) => row,
  milkyWay: () => MILKY_WAY_INFO,
  body: () => null,
  // A picked star has no per-star identity on the bin (SKST v1 quantises
  // position + Gaia photometry only), so the card is a small self-derived
  // view-model built here from the row's raw fields via the Task-1 helpers:
  // distance is |positionMpc| converted Mpc to pc, apparent magnitude follows
  // from the distance modulus, and the spectral class is binned off BP-RP.
  star: (row): StarInfo => {
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

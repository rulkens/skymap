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
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';

const BUILD_FOCUSABLE: {
  [K in SelectionRow['type']]: (row: Extract<SelectionRow, { type: K }>) => FocusableTarget | null;
} = {
  galaxyCatalog: (row) => buildGalaxyInfo(row),
  structure: (row) => row,
  milkyWay: () => MILKY_WAY_INFO,
  body: () => null,
  // Temporarily null, exactly like the body arm: Task 4 flips this to a
  // StarInfo once FocusableTarget widens to carry stars. Keeping it null here
  // means this task lands without touching FocusableTarget or any of its
  // consumers (InfoCard, urlHashFor, targetIdentityKey).
  star: () => null,
};

export function buildFocusable(row: SelectionRow | null): FocusableTarget | null {
  if (row === null) return null;
  return (BUILD_FOCUSABLE[row.type] as (r: SelectionRow) => FocusableTarget | null)(row);
}

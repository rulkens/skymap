/**
 * buildFocusable — the pure, React-side build of the FocusableTarget view-model
 * from a stored SelectionRow. Table-dispatched on the row tag: the galaxy arm
 * runs buildGalaxyInfo (the pure formatter); the structure arm IS already a
 * StructureInfo (a FocusableTarget arm) so it passes through; the Milky Way arm
 * is the singleton const; the body arm is STAR-ONLY — a body row becomes a
 * `StarInfo` focusable iff its id is a famous star (`FAMOUS_STAR_IDS`), so a
 * clicked/deep-linked star drives the InfoCard and the `#focus=body-<id>` hash,
 * while non-star bodies (Earth, planets) map to null and stay body-unaware:
 * no InfoCard, no URL hash, preserving today's search → camera-focus-only
 * behaviour for them. The membership set is derived once in famousStarsIndex
 * off the generated seed table, so this stays a single source of truth.
 *
 * This imports only pure builders + a static const/set, so React can call it
 * inside a memoized selector without reaching the engine — the whole point of
 * the pure-store read. It is the inverse of today's engine-bakes-GalaxyInfo
 * flow.
 */
import { buildGalaxyInfo } from './buildGalaxyInfo';
import { MILKY_WAY_INFO } from '../../../data/milkyWay/milkyWayInfo';
import { FAMOUS_STAR_IDS } from '../../../data/bodies/famousStarsIndex';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';

const BUILD_FOCUSABLE: {
  [K in SelectionRow['type']]: (row: Extract<SelectionRow, { type: K }>) => FocusableTarget | null;
} = {
  galaxyCatalog: (row) => buildGalaxyInfo(row),
  structure: (row) => row,
  milkyWay: () => MILKY_WAY_INFO,
  body: (row) =>
    FAMOUS_STAR_IDS.has(row.id)
      ? {
          type: 'body',
          id: row.id,
          label: row.label,
          positionMpc: row.positionMpc,
          radiusKm: row.radiusKm,
        }
      : null,
};

export function buildFocusable(row: SelectionRow | null): FocusableTarget | null {
  if (row === null) return null;
  return (BUILD_FOCUSABLE[row.type] as (r: SelectionRow) => FocusableTarget | null)(row);
}

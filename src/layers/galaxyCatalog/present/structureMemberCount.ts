/**
 * structureMemberCount — how many currently-rendered galaxies fall inside
 * a cluster / supercluster / void's membership sphere.
 *
 * This is the InfoCard-facing consumer the `structureMembership` cone-search
 * was written for.  It assembles the catalog set the way the renderer
 * draws it — visible galaxy catalog sources only — so the
 * number agrees with both the on-screen points and the focus-mode fade
 * (which keeps exactly these galaxies bright).
 *
 * ### Why this source set
 *
 * The count sums `sourceCounts` over `GALAXY_CATALOG_SOURCES`, gated by
 * `sourceMask` — the same filter the renderer draws with, so the
 * member count tracks the on-screen points: a galaxy catalog toggled off
 * drops straight out of the total.
 *
 * ### Membership radius
 *
 * Uses `apparentRadiusMpc ?? physicalRadiusMpc` — the same cone the
 * GPU focus fade tests against (see `structureFocusSubsystem`).  Counting
 * against the named/visual extent rather than the tighter core radius is
 * what makes "N galaxies" match the set the user sees stay lit on focus.
 *
 * ### Null vs zero
 *
 * Returns `null` when there is nothing to count yet — no visible catalog
 * loaded — so the caller can omit the row entirely rather than flash a
 * misleading "0" during load.  A genuine empty sphere over loaded data
 * returns `0` (truthful: e.g. a void at the small tier really may hold no
 * catalogued galaxies).
 */

import { structureMembership } from './structureMembership';
import { GALAXY_CATALOG_SOURCES } from '../../../data/sources';
import { maskHas } from '../../../utils/maskHas';
import type { GalaxyCatalogSourceType } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { GalaxyRecordSource } from '../../../@types/data/galaxyCatalog/GalaxyRecordSource';
import type { StructureInfo } from '../../../@types/data/structure/StructureInfo';

export function structureMemberCount(
  structure: StructureInfo,
  records: ReadonlyMap<GalaxyCatalogSourceType, GalaxyRecordSource>,
  sourceMask: number,
): number | null {
  const radiusMpc = structure.apparentRadiusMpc ?? structure.physicalRadiusMpc;

  const visible: GalaxyRecordSource[] = [];
  for (const source of GALAXY_CATALOG_SOURCES) {
    if (!maskHas(sourceMask, source)) continue;
    const record = records.get(source);
    if (record === undefined) continue;
    visible.push(record);
  }
  // Nothing loaded/visible to search — "not computable yet", not zero.
  if (visible.length === 0) return null;

  return structureMembership(visible, structure.worldPos, radiusMpc).count;
}

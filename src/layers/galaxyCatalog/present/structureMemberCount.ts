/**
 * structureMemberCount — how many currently-rendered galaxies fall inside a
 * structure's membership sphere (the InfoCard row).
 *
 * Sums the visible galaxy catalog sources (`sourceMask`), so the count tracks
 * the on-screen points. The radius is `apparentRadiusMpc ?? physicalRadiusMpc`,
 * the cone the GPU focus fade tests (`structureFocusSubsystem`), so "N galaxies"
 * matches the set that stays lit on focus.
 *
 * Returns `null` when no visible catalog is loaded (the caller omits the row
 * rather than flash "0" during load); a genuine empty sphere returns `0`.
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

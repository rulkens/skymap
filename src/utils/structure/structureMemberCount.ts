/**
 * structureMemberCount — how many currently-rendered galaxies fall inside
 * a cluster / supercluster / void's membership sphere.
 *
 * This is the InfoCard-facing consumer the `structureMembership` cone-search
 * was written for.  It assembles the catalog set the way the renderer
 * draws it — visible galaxy catalog sources only, Synthetic excluded — so the
 * number agrees with both the on-screen points and the focus-mode fade
 * (which keeps exactly these galaxies bright).
 *
 * ### Why mirror the StatsPanel source set
 *
 * The "Galaxies" total in StatsPanel sums `sourceCounts` over the same
 * filter: `GALAXY_CATALOG_SOURCES` minus Synthetic, gated by `visibleSourceMask`.
 * Reusing that filter here means the member count is a strict subset of
 * the panel's total — a galaxy catalog toggled off drops out of both at once, so
 * the two readouts never contradict each other.  Synthetic is excluded
 * for the same reason StatsPanel excludes it: it only loads in the
 * all-fetch-failed fallback, where labelling its procedural points as
 * member "Galaxies" would mislead.
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
import type { CatalogWithSource } from '../../@types/data/structure/CatalogWithSource';
import { GALAXY_CATALOG_SOURCES, Source } from '../../data/sources';
import { maskHas } from '../maskHas';
import type { GalaxyCatalog } from '../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { SourceType } from '../../@types/data/SourceType';
import type { StructureRecord } from '../../@types/data/structure/StructureRecord';

export function structureMemberCount(
  structure: StructureRecord,
  getCloud: (source: SourceType) => GalaxyCatalog | undefined,
  visibleSourceMask: number,
): number | null {
  const radiusMpc = structure.apparentRadiusMpc ?? structure.physicalRadiusMpc;

  const catalogs: CatalogWithSource[] = [];
  for (const source of GALAXY_CATALOG_SOURCES) {
    if (source === Source.Synthetic) continue;
    if (!maskHas(visibleSourceMask, source)) continue;
    const catalog = getCloud(source);
    if (catalog === undefined) continue;
    catalogs.push({ source, catalog });
  }
  // Nothing loaded/visible to search — "not computable yet", not zero.
  if (catalogs.length === 0) return null;

  return structureMembership(catalogs, structure.worldPos, radiusMpc).count;
}

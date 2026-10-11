import { buildStaticAnchorStructures } from '../../src/layers/structure/load/buildStaticAnchorStructures';
import { STRUCTURE_IDS_BY_SCALE } from '../../src/data/structure/structureIdsByScale';
import type { StructureInfo } from '../../src/@types/data/structure/StructureInfo';
import type { StructureScale } from '../../src/@types/data/structure/StructureScale';

/**
 * The curated anchors whose category sits at `scale` in the source registry —
 * the only structures that get a shot (bulk rows are `featured: false`).
 */
export function featuredAnchorsOfScale(scale: StructureScale): StructureInfo[] {
  const categories: readonly string[] = STRUCTURE_IDS_BY_SCALE[scale];
  return buildStaticAnchorStructures().filter((s) => s.featured && categories.includes(s.category));
}

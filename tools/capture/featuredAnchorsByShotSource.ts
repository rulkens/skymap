import { buildStaticAnchorStructures } from '../../src/layers/structure/load/buildStaticAnchorStructures';
import { structureShotSource } from './structureShotSource';
import type { StructureShotSource } from './@types/StructureShotSource';
import type { StructureInfo } from '../../src/@types/data/structure/StructureInfo';

/** The curated anchors (the only structures with a shot) whose thumbnail comes from `source`. */
export function featuredAnchorsByShotSource(source: StructureShotSource): StructureInfo[] {
  return buildStaticAnchorStructures().filter(
    (s) => s.featured && structureShotSource(s) === source,
  );
}

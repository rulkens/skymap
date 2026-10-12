import { buildStaticAnchorStructures } from '../../src/layers/structure/load/buildStaticAnchorStructures';
import { structureShotSource } from './structureShotSource';
import type { StructureInfo } from '../../src/@types/data/structure/StructureInfo';

/** The curated anchors (the only structures with a shot) whose thumbnail comes from `source`. */
export function featuredAnchorsByShotSource(source: 'render' | 'cutout'): StructureInfo[] {
  return buildStaticAnchorStructures().filter(
    (s) => s.featured && structureShotSource(s) === source,
  );
}

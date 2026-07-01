import type { StructureInfo } from '../../@types/data/structure/StructureInfo';
import type { StructureSearchEntry } from '../../@types/engine/StructureSearchEntry';

/**
 * Project a stored `StructureInfo` down to the lean `StructureSearchEntry` the
 * command palette searches.  Drops the render-only fields (worldPos,
 * significance, radii) and narrows `abell` to the cluster arm — only clusters
 * carry an Abell designation, so we read it after the `category` check rather
 * than off the union (where it doesn't exist for superclusters / voids /
 * groups).
 */
export function toStructureSearchEntry(structure: StructureInfo): StructureSearchEntry {
  return {
    id: structure.id,
    name: structure.name,
    category: structure.category,
    abell: structure.category === 'cluster' ? (structure.abell ?? null) : null,
    description: structure.description ?? '',
  };
}

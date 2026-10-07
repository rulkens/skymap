import type { StructureId } from '../../@types/data/structure/StructureId';
import { SOURCE_ENTRIES } from '../sourceEntries';

const WITH_GALAXY_MEMBERS: ReadonlySet<string> = new Set(
  SOURCE_ENTRIES.filter((e) => e.type === 'structure' && e.galaxyMembers).map((e) => e.id),
);

/**
 * Whether a structure category is a region of the extragalactic galaxy
 * distribution, so focusing one dims non-member galaxies and counts the ones
 * inside. Read from the registry row, never from a list of category names.
 */
export function structureHasGalaxyMembers(id: StructureId): boolean {
  return WITH_GALAXY_MEMBERS.has(id);
}

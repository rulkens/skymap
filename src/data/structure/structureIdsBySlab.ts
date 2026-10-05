import type { StructureSlab } from '../../@types/data/structure/StructureSlab';
import type { StructureId } from '../../@types/data/structure/StructureId';
import { SOURCE_ENTRIES } from '../sourceEntries';

const idsOn = (slab: StructureSlab): readonly StructureId[] =>
  SOURCE_ENTRIES.flatMap((e) => (e.type === 'structure' && e.slab === slab ? [e.id] : []));

/**
 * Each slab's structure categories in registry order. Read from the registry
 * row's `slab`, so the marker passes, their renderers and the label producers
 * partition the categories the same way.
 */
export const STRUCTURE_IDS_BY_SLAB: Readonly<Record<StructureSlab, readonly StructureId[]>> = {
  cosmo: idsOn('cosmo'),
  near0: idsOn('near0'),
};

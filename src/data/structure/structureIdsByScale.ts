import type { StructureScale } from '../../@types/data/structure/StructureScale';
import type { StructureId } from '../../@types/data/structure/StructureId';
import { SOURCE_ENTRIES } from '../sourceEntries';

const idsOf = (scale: StructureScale): readonly StructureId[] =>
  SOURCE_ENTRIES.flatMap((e) => (e.type === 'structure' && e.scale === scale ? [e.id] : []));

/**
 * Each scale's structure categories in registry order. Read from the registry
 * row's `scale`, so the marker passes, their renderers, the label producers and
 * the settings panel partition the categories the same way.
 */
export const STRUCTURE_IDS_BY_SCALE: Readonly<Record<StructureScale, readonly StructureId[]>> = {
  cosmic: idsOf('cosmic'),
  milkyWay: idsOf('milkyWay'),
};

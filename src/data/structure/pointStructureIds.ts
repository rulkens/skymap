import type { StructureId } from '../../@types/data/structure/StructureId';
import { SOURCE_ENTRIES } from '../sourceEntries';

/**
 * Structure categories whose subject is a point (a planet host, a transient),
 * read from the registry row's `pointLike`. Their seed radius only frames the
 * close-up (an orbit diagram, a host galaxy), so the InfoCard shows no Radius
 * and no member count for them.
 */
export const POINT_STRUCTURE_IDS: readonly StructureId[] = SOURCE_ENTRIES.flatMap((e) =>
  e.type === 'structure' && 'pointLike' in e ? [e.id] : [],
);

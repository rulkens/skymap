import type { ObjectSectionCount } from '../@types/ObjectSectionCount';
import { OBJECT_ROWS, OBJECT_SECTIONS } from '../data/objectCatalogue';
import { objectSectionRows } from './objectSectionRows';

/** The sections of the object catalogue with their row counts, for the finder's jump list (the catalogue page is the only one that loads the app's tables). */
export function objectSectionCounts(): ObjectSectionCount[] {
  return OBJECT_SECTIONS.map((section) => ({
    id: section.id,
    title: section.title,
    count: objectSectionRows(section, OBJECT_ROWS).length,
  }));
}

import type { ObjectKind } from '../@types/ObjectKind';
import { OBJECT_ROWS } from '../data/objectCatalogue';

/** How many rows of the object catalogue are of a kind, for a sentence on the catalogue's own page (the only one that loads the app's tables). */
export function objectCount(kind: ObjectKind): number {
  return OBJECT_ROWS.filter((row) => row.kind === kind).length;
}

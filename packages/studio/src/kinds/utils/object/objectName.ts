import { objectText } from './objectText';
import type { ObjectIndex } from '../../../@types/kinds/ObjectIndex';
import type { RowLabel } from '../../../@types/rows/RowLabel';

/** A bound subject's name as the search results or its card show it (its id until it is known). */
export function objectName(subject: RowLabel['subject'], objects: ObjectIndex): string | undefined {
  return subject === undefined ? undefined : objectText(subject, objects);
}

import { useObjectIndex } from './useObjectIndex';
import { objectText } from '../../kinds/utils/object/objectText';
import type { RowLabel } from '../../@types/rows/RowLabel';

/** A bound subject's name as the search results or its card show it (its id until it is known). */
export function useObjectName(subject: RowLabel['subject']): string | undefined {
  const objects = useObjectIndex();
  return subject === undefined ? undefined : objectText(subject, objects);
}

import { useObjectIndex } from './useObjectIndex';
import { objectText } from '../../kinds/utils/object/objectText';

/** A bound subject's name as the search results show it (its id until the index holds it). */
export function useObjectName(id: string | undefined): string | undefined {
  const objects = useObjectIndex();
  return id === undefined ? undefined : objectText(id, objects);
}

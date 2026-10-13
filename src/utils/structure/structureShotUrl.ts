/** A featured structure's shot URL, keyed by its focus id (`StructureInfo.id`). */
import { STRUCTURE_SHOT_DIR } from '../../data/structure/structureShotDir';

export function structureShotUrl(id: string): string {
  return `${STRUCTURE_SHOT_DIR}/${id}.webp`;
}

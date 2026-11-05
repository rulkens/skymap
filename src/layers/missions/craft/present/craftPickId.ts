/**
 * craftPickId — the packed pick word a craft's mesh and caption stamp: the Layer's craft pick code over the
 * craft's index in `MISSION_CRAFT_IDS`, the table `craftSelectionRow`'s `resolvePick` reads
 * back. `null` means SKIP: an index packed from −1 would alias craft 0.
 */

import { Source } from '../../../../data/source';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import { CRAFT_ORDER } from './craftOrder';
import type { CatalogPickCodes } from '../../../../@types/engine/selection/CatalogPickCodes';
import type { SourceType } from '../../../../@types/data/SourceType';
import type { SceneBodyId } from '../../../../@types/scene/SceneBodyId';

export function craftPickId(
  bodyId: SceneBodyId,
  pickCodes: CatalogPickCodes<SourceType>,
): number | null {
  const index = CRAFT_ORDER.indexOf(bodyId);
  return index < 0
    ? null
    : packSelection(pickCodes.pickCodeOf(Source.Craft), index + PICK_SENTINEL_OFFSET);
}

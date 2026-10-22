/**
 * craftPickId — the packed pick word a craft's mesh and caption stamp: `Source.Craft` over the
 * craft's index in `MISSION_CRAFT_IDS`, the table `craftSelectionRow`'s `resolvePick` reads
 * back. `null` means SKIP: an index packed from −1 would alias craft 0.
 */

import { Source } from '../../../data/source';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';
import { CRAFT_ORDER } from './craftOrder';

export function craftPickId(bodyId: string): number | null {
  const index = CRAFT_ORDER.indexOf(bodyId);
  return index < 0 ? null : packSelection(Source.Craft, index + PICK_SENTINEL_OFFSET);
}

/**
 * craftSelectionRow — the `craft` selection kind: the missions Layer's craft, read exactly as a
 * body (same row fields, driver and framing) under their own tag. Deep links keep `body-<id>`,
 * claimed here for craft ids only, so the `body` kind's claim stays disjoint.
 */

import { Source } from '../../../data/source';
import { BODY_FOCUS_PREFIX } from '../../../services/url/bodyFocusId';
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { bodyRowAt } from '../../../utils/scene/bodyRowAt';
import { MISSION_CRAFT_IDS } from './missionCraftIds';
import { CRAFT_ORDER } from './craftOrder';
import { craftPickId } from './craftPickId';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import type { SceneBodyId } from '../../../@types/scene/SceneBodyId';
import { isSceneBodyId } from '../../../utils/scene/isSceneBodyId';

const isCraftId = (id: string): id is SceneBodyId => isSceneBodyId(id) && MISSION_CRAFT_IDS.has(id);

export function craftSelectionRow(): SelectionKindRow<Extract<SelectionRef, { type: 'craft' }>> {
  const decode = (id: string): Extract<SelectionRef, { type: 'craft' }> | null => {
    if (!id.startsWith(BODY_FOCUS_PREFIX)) return null;
    const craftId = id.slice(BODY_FOCUS_PREFIX.length);
    return isCraftId(craftId) ? { type: 'craft', id: craftId } : null;
  };
  return {
    type: 'craft',
    pickSources: [Source.Craft],
    resolvePick: (_entry, pick) => {
      const id = CRAFT_ORDER[pick.localIdx];
      return id === undefined ? null : { type: 'craft', id };
    },
    encodePick: (ref) => craftPickId(ref.id),
    extractRow: (ref, simDays) => {
      if (!MISSION_CRAFT_IDS.has(ref.id)) return null;
      const row = bodyRowAt(ref.id, deriveBodyStates(simDays).get(ref.id)!.positionMpc);
      return { ...row, type: 'craft' };
    },
    focusId: {
      claims: (id) => decode(id) !== null,
      decode,
      encode: (ref) => `${BODY_FOCUS_PREFIX}${ref.id}`,
    },
  };
}

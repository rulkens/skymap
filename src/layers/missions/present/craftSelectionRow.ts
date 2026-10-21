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
import { craftPickId } from './craftPickId';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';

// `craftPickId` packs an index into this same order.
const CRAFT_ORDER = [...MISSION_CRAFT_IDS];

export function craftSelectionRow(): SelectionKindRow<Extract<SelectionRef, { type: 'craft' }>> {
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
      claims: (id) =>
        id.startsWith(BODY_FOCUS_PREFIX) &&
        MISSION_CRAFT_IDS.has(id.slice(BODY_FOCUS_PREFIX.length)),
      decode: (id) => ({ type: 'craft', id: id.slice(BODY_FOCUS_PREFIX.length) }),
      encode: (ref) => `${BODY_FOCUS_PREFIX}${ref.id}`,
    },
  };
}

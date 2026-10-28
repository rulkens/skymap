/**
 * earthSceneSelectionRow — the `earthScene` selection kind: the earthScenes Layer's scenes, read
 * exactly as a body (same row fields, driver and framing) under their own tag. Unpicked: no pick
 * source, since `earthSceneMeshesPass` stamps none. Deep links keep `body-<id>`, claimed here for
 * Earth scene ids only, so the `body` kind's claim stays disjoint.
 */

import { BODY_FOCUS_PREFIX } from '../../../services/url/bodyFocusId';
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { bodyRowAt } from '../../../utils/scene/bodyRowAt';
import { isSceneBodyId } from '../../../utils/scene/isSceneBodyId';
import { EARTH_SCENE_BODY_IDS } from '../../../data/bodies/earthSceneBodyIds';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import type { SceneBodyId } from '../../../@types/scene/SceneBodyId';

const isEarthSceneId = (id: string): id is SceneBodyId =>
  isSceneBodyId(id) && EARTH_SCENE_BODY_IDS.has(id);

export function earthSceneSelectionRow(): SelectionKindRow<
  Extract<SelectionRef, { type: 'earthScene' }>
> {
  const decode = (id: string): Extract<SelectionRef, { type: 'earthScene' }> | null => {
    if (!id.startsWith(BODY_FOCUS_PREFIX)) return null;
    const sceneId = id.slice(BODY_FOCUS_PREFIX.length);
    return isEarthSceneId(sceneId) ? { type: 'earthScene', id: sceneId } : null;
  };
  return {
    type: 'earthScene',
    pickSources: [],
    resolvePick: () => null,
    encodePick: () => null,
    extractRow: (ref, simDays) => {
      if (!EARTH_SCENE_BODY_IDS.has(ref.id)) return null;
      const row = bodyRowAt(ref.id, deriveBodyStates(simDays).get(ref.id)!.positionMpc);
      return { ...row, type: 'earthScene' };
    },
    focusId: {
      claims: (id) => decode(id) !== null,
      decode,
      encode: (ref) => `${BODY_FOCUS_PREFIX}${ref.id}`,
    },
  };
}

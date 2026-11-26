/**
 * probeSphereSelectionRow — the `probeSphere` selection kind: each sphere read exactly as a body
 * under its own tag, as `earthSceneSelectionRow` reads a scene. Unpicked. Deep links keep
 * `body-<id>`, claimed here for the sphere ids only, so the `body` kind's claim stays disjoint.
 */

import { BODY_FOCUS_PREFIX } from '../../../services/url/bodyFocusId';
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { bodyRowAt } from '../../../utils/scene/bodyRowAt';
import { isSceneBodyId } from '../../../utils/scene/isSceneBodyId';
import { PROBE_SPHERE_ROSTER } from '../spheres/data/probeSphereRoster';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import type { SceneBodyId } from '../../../@types/scene/SceneBodyId';
import type { ProbeSphereRef } from './@types/ProbeSphereRef';
import { hitOrAbsent } from '../../../utils/selection/hitOrAbsent';

const isProbeSphereId = (id: string): id is SceneBodyId =>
  isSceneBodyId(id) && PROBE_SPHERE_ROSTER.has(id);

export function probeSphereSelectionRow(): SelectionKindRow<ProbeSphereRef> {
  const decode = (id: string): ProbeSphereRef | null => {
    if (!id.startsWith(BODY_FOCUS_PREFIX)) return null;
    const sphereId = id.slice(BODY_FOCUS_PREFIX.length);
    return isProbeSphereId(sphereId) ? { type: 'probeSphere', id: sphereId } : null;
  };
  return {
    type: 'probeSphere',
    pickSources: [],
    resolvePick: () => null,
    encodePick: () => null,
    extractRow: (ref, simDays) => {
      if (!PROBE_SPHERE_ROSTER.has(ref.id)) return null;
      const row = bodyRowAt(ref.id, deriveBodyStates(simDays).get(ref.id)!.positionMpc);
      return { ...row, type: 'probeSphere' };
    },
    focusId: {
      claims: (id) => decode(id) !== null,
      decode: (id) => hitOrAbsent(decode(id)),
      encode: (ref) => `${BODY_FOCUS_PREFIX}${ref.id}`,
    },
  };
}

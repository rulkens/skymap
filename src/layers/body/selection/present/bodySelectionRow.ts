/**
 * bodySelectionRow — the body Layer's `body` selection kind: Earth, the planets and the moons
 * (the craft are the missions Layer's `craft` kind, Søndermarken the earthScenes Layer's
 * `earthScene` kind, Sgr A* the blackHoles Layer's `blackHole` kind). A star is a `starCatalog`
 * ref wherever it comes from (spec §7), so `body-sirius` does not decode. Position is
 * re-derived at `extractRow`'s own `simDays`, never cached.
 */

import { SCENE_BODIES } from '../../../../data/bodies/sceneBodies';
import { BODY_PICK_ROWS } from '../../../../data/bodies/bodyPickRows';
import { BODY_FOCUS_PREFIX } from '../../../../services/url/bodyFocusId';
import { BODY_SOURCE_ROWS } from '../../sources/bodySourceRows';
import { bodyCodeOf } from './bodyCodeOf';
import { sceneBodyPickId } from '../../../../utils/picking/sceneBodyPickId';
import { bodyRowAt } from '../../../../utils/scene/bodyRowAt';
import { isBodyKindId } from './isBodyKindId';
import { deriveBodyStates } from '../../../../services/engine/frame/deriveBodyStates';
import type { SelectionKindRow } from '../../../../@types/engine/layer/SelectionKindRow';
import type { BodyRuntime } from '../../@types/BodyRuntime';
import type { BodySourceId } from '../../../../@types/data/body/BodySourceId';
import type { BodyRef } from '../../../../@types/engine/selection/BodyRef';

export function bodySelectionRow(
  runtime: Pick<BodyRuntime, 'pickCodes'>,
): SelectionKindRow<BodyRef> {
  const { pickCodes } = runtime;
  const codeOf = bodyCodeOf(pickCodes);
  // Exact, not the whole prefix: a craft's or an Earth scene's `body-<id>` is its own kind's claim.
  const decode = (id: string): BodyRef | null => {
    if (!id.startsWith(BODY_FOCUS_PREFIX)) return null;
    const bodyId = id.slice(BODY_FOCUS_PREFIX.length);
    return isBodyKindId(bodyId) ? { type: 'body', id: bodyId } : null;
  };
  return {
    type: 'body',
    pickSources: BODY_SOURCE_ROWS.map(([source]) => pickCodes.pickCodeOf(source)),
    resolvePick: (pick) => {
      const source = pickCodes.catalogOfPickCode(pick.sourceCode);
      const entry = BODY_SOURCE_ROWS.find(([s]) => s === source)?.[1];
      if (!entry) return null;
      const seeds = BODY_PICK_ROWS[entry.id as BodySourceId];
      const body = seeds[pick.localIdx];
      return body ? { type: 'body', id: body.id } : null;
    },
    encodePick: (ref) => sceneBodyPickId(ref.id, codeOf),
    extractRow: (ref, simDays) => {
      if (!SCENE_BODIES.some((b) => b.id === ref.id)) return null;
      return bodyRowAt(ref.id, deriveBodyStates(simDays).get(ref.id)!.positionMpc);
    },
    focusId: {
      claims: (id) => decode(id) !== null,
      decode,
      encode: (ref) => `${BODY_FOCUS_PREFIX}${ref.id}`,
    },
  };
}

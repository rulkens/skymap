/**
 * bodySelectionRow — scene bodies only: Earth, the planets and the mesh bodies
 * core owns (the craft are the missions Layer's `craft` kind, Sgr A* the
 * blackHoles Layer's `blackHole` kind). A star is a `starCatalog` ref wherever
 * it comes from (spec §7), so `body-sirius` no longer decodes. Position is re-derived at `extractRow`'s own
 * `simDays`, never cached.
 */

import { SOURCE_ENTRIES } from '../../../data/sourceEntries';
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';
import { BODY_PICK_ROWS } from '../../../data/bodies/bodyPickRows';
import { BODY_FOCUS_PREFIX } from '../../url/bodyFocusId';
import { sceneBodyPickId } from '../../../utils/picking/sceneBodyPickId';
import { bodyRowAt } from '../../../utils/scene/bodyRowAt';
import { isCoreBodyId } from '../../../utils/scene/isCoreBodyId';
import { deriveBodyStates } from '../frame/deriveBodyStates';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import type { SourceType } from '../../../@types/data/SourceType';
import type { BodySourceId } from '../../../@types/data/body/BodySourceId';

type BodyRef = Extract<SelectionRef, { type: 'body' }>;

const BODY_SOURCE_CODES: readonly SourceType[] = SOURCE_ENTRIES.filter(
  (e) => e.type === 'body',
).map((e) => e.code as SourceType);

export function bodySelectionRow(): SelectionKindRow<BodyRef> {
  // Exact, not the whole prefix: a craft's `body-<id>` is the `craft` kind's claim.
  const decode = (id: string): BodyRef | null => {
    if (!id.startsWith(BODY_FOCUS_PREFIX)) return null;
    const bodyId = id.slice(BODY_FOCUS_PREFIX.length);
    return isCoreBodyId(bodyId) ? { type: 'body', id: bodyId } : null;
  };
  return {
    type: 'body',
    pickSources: BODY_SOURCE_CODES,
    resolvePick: (entry, pick) => {
      if (entry.type !== 'body') return null;
      const seeds = BODY_PICK_ROWS[entry.id as BodySourceId];
      const body = seeds[pick.localIdx];
      return body ? { type: 'body', id: body.id } : null;
    },
    encodePick: (ref) => sceneBodyPickId(ref.id),
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

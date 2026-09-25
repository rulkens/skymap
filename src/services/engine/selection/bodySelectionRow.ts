/**
 * bodySelectionRow — scene bodies only: Earth, the planets and the mesh bodies
 * (Sgr A* is the blackHoles Layer's own `blackHole` kind). A star is a `starCatalog` ref wherever it comes from (spec §7), so
 * `body-sirius` no longer decodes. Position is re-derived at `extractRow`'s own
 * `simDays`, never cached.
 */

import { SOURCE_ENTRIES } from '../../../data/sourceEntries';
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';
import { BODY_PICK_ROWS } from '../../../data/bodies/bodyPickRows';
import { BODY_FOCUS_PREFIX } from '../../url/bodyFocusId';
import { bodyDriverGeometry } from '../../../utils/scene/bodyDriverGeometry';
import { isRegistryBodyId } from '../../../utils/scene/isRegistryBodyId';
import { deriveBodyStates } from '../frame/deriveBodyStates';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import type { SourceType } from '../../../@types/data/SourceType';
import type { BodyId } from '../../../@types/data/body/BodyId';

type BodyRef = Extract<SelectionRef, { type: 'body' }>;

const BODY_SOURCE_CODES: readonly SourceType[] = SOURCE_ENTRIES.filter(
  (e) => e.type === 'body',
).map((e) => e.code as SourceType);

export function bodySelectionRow(): SelectionKindRow<BodyRef> {
  return {
    type: 'body',
    pickSources: BODY_SOURCE_CODES,
    resolvePick: (entry, pick) => {
      if (entry.type !== 'body') return null;
      const seeds = BODY_PICK_ROWS[entry.id as BodyId];
      const body = seeds[pick.localIdx];
      return body ? { type: 'body', id: body.id } : null;
    },
    extractRow: (ref, simDays) => {
      const body = SCENE_BODIES.find((b) => b.id === ref.id);
      if (!body) return null;
      const p = deriveBodyStates(simDays).get(body.id)!.positionMpc;
      return {
        type: 'body',
        id: body.id,
        label: body.label,
        positionMpc: [p[0], p[1], p[2]],
        driver: bodyDriverGeometry(body.id),
      };
    },
    focusId: {
      claims: (id) => id.startsWith(BODY_FOCUS_PREFIX),
      decode: (id) => {
        const seedId = id.slice(BODY_FOCUS_PREFIX.length);
        return isRegistryBodyId(seedId) ? { type: 'body', id: seedId } : null;
      },
      encode: (ref) => `${BODY_FOCUS_PREFIX}${ref.id}`,
    },
  };
}

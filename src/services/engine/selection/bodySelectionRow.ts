/**
 * bodySelectionRow — scene bodies (Earth, planets, Sgr A*, mesh bodies) plus
 * every seeded star catalog, whose picks resolve to a body ref because their
 * registry entry has no bin. Position is re-derived at `extractRow`'s own
 * `simDays`, never cached.
 */

import { SOURCE_ENTRIES } from '../../../data/sourceEntries';
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';
import { SEEDED_STAR_CATALOGS } from '../../../data/bodies/seededStarCatalogs';
import { BODY_PICK_ROWS } from '../../../data/bodies/bodyPickRows';
import { BODY_FOCUS_PREFIX } from '../../url/bodyFocusId';
import { isSceneBodyId } from '../../../utils/scene/isSceneBodyId';
import { deriveBodyStates } from '../frame/deriveBodyStates';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import type { SourceType } from '../../../@types/data/SourceType';
import type { BodyId } from '../../../@types/data/body/BodyId';
import type { SeededStarCatalogId } from '../../../@types/data/starCatalog/SeededStarCatalogId';

type BodyRef = Extract<SelectionRef, { type: 'body' }>;

const BODY_SOURCE_CODES: readonly SourceType[] = SOURCE_ENTRIES.filter(
  (e) => e.type === 'body' || (e.type === 'starCatalog' && e.binBaseName === null),
).map((e) => e.code as SourceType);

export function bodySelectionRow(): SelectionKindRow<BodyRef> {
  return {
    type: 'body',
    pickSources: BODY_SOURCE_CODES,
    resolvePick: (entry, pick) => {
      // A seeded star catalog has no bin (binBaseName: null); its pick resolves
      // through its own seed table like the planet/earth arms do, not through
      // the positional star arm.
      if (entry.type === 'starCatalog' && entry.binBaseName === null) {
        const body = SEEDED_STAR_CATALOGS[entry.id as SeededStarCatalogId][pick.localIdx];
        return body ? { type: 'body', id: body.id } : null;
      }
      if (entry.type !== 'body') return null;
      const seeds = BODY_PICK_ROWS[entry.id as BodyId];
      const body = seeds[pick.localIdx];
      return body ? { type: 'body', id: body.id } : null;
    },
    extractRow: (ref, simDays) => {
      const body = SCENE_BODIES.find((b) => b.id === ref.id);
      if (!body) return null;
      const p = deriveBodyStates(simDays).get(body.id)!.positionMpc;
      return { type: 'body', id: body.id, label: body.label, positionMpc: [p[0], p[1], p[2]] };
    },
    focusId: {
      claims: (id) => id.startsWith(BODY_FOCUS_PREFIX),
      decode: (id) => {
        const seedId = id.slice(BODY_FOCUS_PREFIX.length);
        return isSceneBodyId(seedId) ? { type: 'body', id: seedId } : null;
      },
      encode: (ref) => `${BODY_FOCUS_PREFIX}${ref.id}`,
    },
  };
}

/**
 * structureSelectionRow — the `SelectionKindRow` for the marker-ring structure
 * categories. Pick identity resolves the durable id via
 * `resolveStructureFromPick`; focus ids are the durable `${category}-${seed}`
 * token already, so no cloud read is needed to encode. The store is read at
 * call time, so records that land after boot resolve without rebuilding the row.
 */

import { STRUCTURE_IDS } from '../../../../data/structure/structureIds';
import { structurePickId } from '../utils/structurePickId';
import { placedStructureRow } from '../utils/placedStructureRow';
import { resolveStructureFromPick } from './resolveStructureFromPick';
import type { StructureRuntime } from '../../@types/StructureRuntime';
import type { StructureStore } from '../../catalog/@types/StructureStore';
import type { SelectionKindRow } from '../../../../@types/engine/layer/SelectionKindRow';
import type { StructureRef } from '../../@types/StructureRef';

/** A bare token must satisfy this character class to be a structure seed id. */
const SAFE_ID_RE = /^[a-z0-9_-]+$/i;

export function structureSelectionRow(
  runtime: { readonly store: Pick<StructureStore, 'byId' | 'byCategory'> } & Pick<
    StructureRuntime,
    'pickCodes'
  >,
): SelectionKindRow<StructureRef> {
  const { store, pickCodes } = runtime;
  return {
    type: 'structure',
    pickSources: STRUCTURE_IDS.map(pickCodes.pickCodeOf),
    resolvePick: (pick) => {
      const category = pickCodes.catalogOfPickCode(pick.sourceCode);
      if (category === null) return null;
      const record = resolveStructureFromPick(store, {
        category,
        structureIndex: pick.localIdx,
      });
      return record ? { type: 'structure', id: record.id } : null;
    },
    encodePick: (ref) => {
      const record = store.byId(ref.id);
      if (!record) return null;
      const index = store.byCategory(record.category).findIndex((r) => r.id === ref.id);
      return index < 0 ? null : structurePickId(record.category, index, pickCodes);
    },
    extractRow: (ref) => {
      const record = store.byId(ref.id);
      return record ? placedStructureRow(record) : null;
    },
    focusId: {
      claims: (id) => STRUCTURE_IDS.some((cat) => id.startsWith(`${cat}-`)),
      decode: (id) => (SAFE_ID_RE.test(id) ? { type: 'structure', id } : null),
      encode: (ref) => ref.id,
    },
  };
}

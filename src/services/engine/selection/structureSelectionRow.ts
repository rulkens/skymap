/**
 * structureSelectionRow — the core `SelectionKindRow` for the marker-ring
 * categories (cluster / supercluster / void / group). Pick identity resolves
 * the durable id via `resolveStructureFromPick`; focus ids are the durable
 * `${category}-${seed}` token already, so no cloud read is needed to encode.
 */

import { SOURCE_ENTRIES } from '../../../data/sourceEntries';
import { STRUCTURE_IDS } from '../../../data/structure/structureIds';
import { resolveStructureFromPick } from '../helpers/resolveStructureFromPick';
import type { ResolveDeps } from '../../../@types/engine/ResolveDeps';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import type { SourceType } from '../../../@types/data/SourceType';
import type { StructureId } from '../../../@types/data/structure/StructureId';

type StructureRef = Extract<SelectionRef, { type: 'structure' }>;

const STRUCTURE_SOURCE_CODES: readonly SourceType[] = SOURCE_ENTRIES.filter(
  (e) => e.type === 'structure',
).map((e) => e.code as SourceType);

/** A bare token must satisfy this character class to be a structure seed id. */
const SAFE_ID_RE = /^[a-z0-9_-]+$/i;

export function structureSelectionRow(
  deps: () => Pick<ResolveDeps, 'structures'>,
): SelectionKindRow<StructureRef> {
  return {
    type: 'structure',
    pickSources: STRUCTURE_SOURCE_CODES,
    resolvePick: (entry, pick) => {
      if (entry.type !== 'structure') return null;
      const record = resolveStructureFromPick(deps().structures, {
        category: entry.id as StructureId,
        structureIndex: pick.localIdx,
      });
      return record ? { type: 'structure', id: record.id } : null;
    },
    extractRow: (ref) => deps().structures.byId(ref.id),
    focusId: {
      claims: (id) => STRUCTURE_IDS.some((cat) => id.startsWith(`${cat}-`)),
      decode: (id) => (SAFE_ID_RE.test(id) ? { type: 'structure', id } : null),
      encode: (ref) => ref.id,
    },
  };
}

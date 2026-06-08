/**
 * pickToSelection — the one place a decoded pick (`sourceCode + localIdx`)
 * becomes a `Selection`. Reads the registry to classify the code: a `survey`
 * code is a galaxy point; a `structure` code is a marker ring, resolved
 * through the structure store to carry the record's stable `id`. Any other
 * code (filament / volume / unallocated) isn't a pickable surface — warn and
 * return null rather than leak a ghost hit into the selection.
 *
 * Shared by the hover path (`runFrame`) and the click path (`clickHandler`)
 * so the two can't drift on how a pixel maps to a `Selection`. Classifying
 * here (not in `unpackPick`) keeps the decode store-free and the registry the
 * single source of truth for which codes are pickable.
 */

import { SOURCE_REGISTRY } from '../../../data/sources';
import { resolveStructureFromPick } from './resolveStructureFromPick';
import type { PickResult } from '../../../data/selectionEncoding';
import type { Selection } from '../../../@types/engine/subsystems/Selection';
import type { StructureCategory } from '../../../@types/engine/data/StructureCategory';
import type { PickStructureStore } from '../../../@types/engine/data/PickStructureStore';

export function pickToSelection(
  pick: PickResult | null,
  structures: PickStructureStore,
): Selection | null {
  if (pick === null) return null;
  const entry = SOURCE_REGISTRY[pick.sourceCode];
  if (entry?.type === 'survey') {
    return { kind: 'galaxy', source: pick.sourceCode, localIdx: pick.localIdx };
  }
  if (entry?.type === 'structure') {
    // A structure entry's id *is* its category (StructureCategory derives from
    // exactly these ids), so the cast is sound by construction.
    const record = resolveStructureFromPick(structures, {
      category: entry.id as StructureCategory,
      structureIndex: pick.localIdx,
    });
    return record ? { kind: 'structure', id: record.id } : null;
  }
  console.warn(`pickToSelection: source code ${pick.sourceCode} is not a pickable surface`);
  return null;
}

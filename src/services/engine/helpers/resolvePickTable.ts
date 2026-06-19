/**
 * RESOLVE_PICK — table dispatch turning a decoded pick into a SelectionRef
 * (identity), not a resolved FocusableTarget. The galaxy arm is positional
 * (source + localIdx); the structure arm resolves the pick index to the record
 * to recover its durable id; the Milky Way is the singleton tag. The display
 * row is materialized later by the reconciler — the pick only commits identity.
 */
import { resolveStructureFromPick } from './resolveStructureFromPick';
import type { SourceEntry } from '../../../@types/data/SourceEntry';
import type { PickResult } from '../../../@types/data/PickResult';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { StructureId } from '../../../@types/data/structure/StructureId';
import type { GalaxyCatalogSourceType } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { ResolvePickDeps } from '../../../@types/engine/ResolvePickDeps';

export const RESOLVE_PICK: Partial<
  Record<
    SourceEntry['type'],
    (entry: SourceEntry, pick: PickResult, deps: ResolvePickDeps) => SelectionRef | null
  >
> = {
  // Galaxy identity is purely positional — no cloud read needed. The
  // reconciler resolves the cloud at display time, insulating the pick path
  // from tier-swap races (a stale index is re-anchored by the tier saga).
  galaxyCatalog: (_entry, pick) => ({
    type: 'galaxyCatalog',
    source: pick.sourceCode as GalaxyCatalogSourceType,
    index: pick.localIdx,
  }),
  // A structure entry's id *is* its category (StructureId derives from exactly
  // these ids), so the cast is sound by construction. The record's durable `id`
  // becomes the ref — stable across re-loads and tier swaps.
  structure: (entry, pick, deps) => {
    if (entry.type !== 'structure') return null;
    const record = resolveStructureFromPick(deps.structures, {
      category: entry.id as StructureId,
      structureIndex: pick.localIdx,
    });
    return record ? { type: 'structure', id: record.id } : null;
  },
  // The Milky Way is a singleton: the pick resolves to the tag with no
  // per-instance data needed.
  milkyWay: () => ({ type: 'milkyWay' }),
};

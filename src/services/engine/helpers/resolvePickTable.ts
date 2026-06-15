/**
 * RESOLVE_PICK — table dispatch turning a decoded pick's source-registry entry
 * into a resolved FocusableTarget, keyed on the entry's `type` tag. A row
 * exists only for the pickable kinds; an absent key (filament / volume /
 * unallocated) means "not a pickable surface" — resolvePick warns and returns
 * null. Each row narrows the entry on `type` (no cast) so the table value type
 * stays uniform while each kind resolves its own concrete arm.
 */
import { resolveGalaxyInfo } from './resolveGalaxyInfo';
import { resolveStructureFromPick } from './resolveStructureFromPick';
import { MILKY_WAY_INFO } from '../../../data/milkyWay/milkyWayInfo';
import type { SourceEntry } from '../../../@types/data/SourceEntry';
import type { PickResult } from '../../../@types/data/PickResult';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import type { StructureId } from '../../../@types/data/structure/StructureId';
import type { ResolvePickDeps } from '../../../@types/engine/ResolvePickDeps';

export const RESOLVE_PICK: Partial<
  Record<
    SourceEntry['type'],
    (entry: SourceEntry, pick: PickResult, deps: ResolvePickDeps) => FocusableTarget | null
  >
> = {
  galaxyCatalog: (_entry, pick, deps) =>
    resolveGalaxyInfo(
      deps.getCloud(pick.sourceCode),
      pick.localIdx,
      pick.sourceCode,
      deps.getFamousMeta(),
    ),
  // A structure entry's id *is* its category (StructureId derives from exactly
  // these ids), so the cast is sound by construction.
  structure: (entry, pick, deps) =>
    entry.type === 'structure'
      ? resolveStructureFromPick(deps.structures, {
          category: entry.id as StructureId,
          structureIndex: pick.localIdx,
        })
      : null,
  // The Milky Way is a singleton: the pick resolves straight to the static const.
  milkyWay: () => MILKY_WAY_INFO,
};

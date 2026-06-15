/**
 * resolvePick — the one boundary where a decoded GPU pick (`sourceCode +
 * localIdx`) becomes a fully RESOLVED `FocusableTarget`. It merges the two
 * steps that used to be separate — `pickToSelection` (classify the code) and
 * the subsystem's internal `resolveTarget` (turn that classification into a
 * `GalaxyInfo` / `StructureInfo`) — into a single registry-driven dispatch, so
 * a pixel maps straight to the target the camera/InfoCard consume.
 *
 * Dispatch is a table lookup on `SOURCE_REGISTRY[code].type`: a `galaxyCatalog`
 * code resolves through `resolveGalaxyInfo`; a `structure` code resolves through
 * `resolveStructureFromPick`. Any other code (filament / volume / unallocated)
 * isn't a pickable surface — warn and return null rather than leak a ghost hit.
 * Classifying here (not in `unpackPick`) keeps the decode store-free and the
 * registry the single source of truth for which codes are pickable.
 */

import { SOURCE_REGISTRY } from '../../../data/sources';
import { resolveGalaxyInfo } from './resolveGalaxyInfo';
import { resolveStructureFromPick } from './resolveStructureFromPick';
import type { PickResult } from '../../../@types/data/PickResult';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import type { StructureCategory } from '../../../@types/data/structure/StructureCategory';
import type { ResolvePickDeps } from '../../../@types/engine/ResolvePickDeps';

export function resolvePick(
  pick: PickResult | null,
  deps: ResolvePickDeps,
): FocusableTarget | null {
  if (pick === null) return null;
  const entry = SOURCE_REGISTRY[pick.sourceCode];
  if (entry?.type === 'galaxyCatalog') {
    return resolveGalaxyInfo(
      deps.getCloud(pick.sourceCode),
      pick.localIdx,
      pick.sourceCode,
      deps.getFamousMeta(),
    );
  }
  if (entry?.type === 'structure') {
    // A structure entry's id *is* its category (StructureCategory derives from
    // exactly these ids), so the cast is sound by construction.
    return resolveStructureFromPick(deps.structures, {
      category: entry.id as StructureCategory,
      structureIndex: pick.localIdx,
    });
  }
  console.warn(`resolvePick: source code ${pick.sourceCode} is not a pickable surface`);
  return null;
}

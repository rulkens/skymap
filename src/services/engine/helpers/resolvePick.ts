/**
 * resolvePick — the one boundary where a decoded GPU pick (`sourceCode +
 * localIdx`) becomes a fully RESOLVED `FocusableTarget`. A single
 * registry-driven dispatch classifies the code and turns it into the concrete
 * `GalaxyInfo` / `StructureInfo` / Milky-Way const, so a pixel maps straight to
 * the target the camera/InfoCard consume.
 *
 * Dispatch is table-driven via `RESOLVE_PICK`, keyed on
 * `SOURCE_REGISTRY[code].type`. A row exists only for the pickable kinds; an
 * absent key (filament / volume / unallocated) means the code isn't a pickable
 * surface — warn and return null rather than leak a ghost hit. Classifying here
 * (not in `unpackPick`) keeps the decode store-free and the registry the single
 * source of truth for which codes are pickable.
 */

import { SOURCE_REGISTRY } from '../../../data/sources';
import { RESOLVE_PICK } from './resolvePickTable';
import type { PickResult } from '../../../@types/data/PickResult';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import type { ResolvePickDeps } from '../../../@types/engine/ResolvePickDeps';

export function resolvePick(
  pick: PickResult | null,
  deps: ResolvePickDeps,
): FocusableTarget | null {
  if (pick === null) return null;
  const entry = SOURCE_REGISTRY[pick.sourceCode];
  const resolve = entry ? RESOLVE_PICK[entry.type] : undefined;
  if (resolve === undefined) {
    console.warn(`resolvePick: source code ${pick.sourceCode} is not a pickable surface`);
    return null;
  }
  return resolve(entry, pick, deps);
}

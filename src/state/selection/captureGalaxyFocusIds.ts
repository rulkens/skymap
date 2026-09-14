/**
 * captureGalaxyFocusIds — snapshot each galaxy-arm selection ref's durable focus
 * id while the OLD cloud is still present: a galaxy ref is positional
 * (source+index), so a tier reload repoints that index at a different galaxy.
 *
 * LANDMINE: capture only sources whose request drifts across the swap — a
 * tier-agnostic source keeps its request, never reloads, and would block the
 * consumer's `take(catalogLoaded)` forever. Capture and the demand loop both
 * derive the request from `galaxyCatalogRequest`, so they cannot disagree.
 */

import { focusIdOf } from '../../services/url/focusIdOf';
import { selectSelectedRef, selectFocusRef } from './selectors';
import { galaxyCatalogRequest } from '../../services/engine/wiring/galaxyCatalogRequest';
import { sameRequest } from '../../utils/loading/sameRequest';
import { galaxyCatalogIdOf } from '../../utils/galaxyCatalogIdOf';
import type { RootState } from '../../store/types';
import type { ResolveDeps } from '../../@types/engine/ResolveDeps';
import type { SelectionSlot } from '../../@types/engine/SelectionSlot';
import type { GalaxyCatalogSourceType } from '../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { Tier } from '../../@types/data/Tier';

/**
 * A captured galaxy ref that needs re-anchoring after the tier swap.
 * `source` is carried so the consumer can filter `catalogLoaded` to the right
 * source and avoid waiting for an unrelated catalog's load event.
 */
export type GalaxyReanchor = {
  readonly slot: SelectionSlot;
  readonly source: GalaxyCatalogSourceType;
  readonly focusId: string;
};

export function captureGalaxyFocusIds(
  state: RootState,
  deps: ResolveDeps,
  prevTier: Tier,
  nextTier: Tier,
): GalaxyReanchor[] {
  const slots: Array<{ slot: 'select' | 'focus'; ref: ReturnType<typeof selectFocusRef> }> = [
    { slot: 'select', ref: selectSelectedRef(state) },
    { slot: 'focus', ref: selectFocusRef(state) },
  ];
  const out: GalaxyReanchor[] = [];
  for (const { slot, ref } of slots) {
    if (!ref || ref.type !== 'galaxyCatalog') continue;
    // Capture only when the demand loop will actually reload this source: its
    // request drifts across the swap, and the catalog is enabled (a disabled
    // source's slot is never demanded, so no `catalogLoaded` fires for it).
    const drifts = !sameRequest(
      galaxyCatalogRequest(ref.source, prevTier),
      galaxyCatalogRequest(ref.source, nextTier),
    );
    const enabled =
      state.settings.galaxyCatalogs.items[galaxyCatalogIdOf(ref.source)]?.enabled === true;
    if (!drifts || !enabled) continue;
    // focusIdOf returns null when the cloud is absent or the ref has no durable
    // representation (Milky Way, already guarded above). Skip nulls so the
    // return type carries only resolvable ids.
    const focusId = focusIdOf(ref, deps);
    if (focusId !== null) out.push({ slot, source: ref.source, focusId });
  }
  return out;
}

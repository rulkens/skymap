/**
 * captureGalaxyFocusIds — read the durable focus id of each galaxy-arm selection
 * ref BEFORE a tier swap evicts the old clouds. A galaxy ref is positional
 * (source+index), so after eviction the same index points at a different galaxy
 * (or none); encoding to the durable id here (while the OLD cloud is still
 * present) lets the saga re-resolve to the NEW index once the new tier loads.
 *
 * Only refs whose source's request actually drifts across the swap are
 * captured. Tier-agnostic sources (2MRS, Famous, the DESI cuts, Synthetic)
 * name the same request for every tier, so capturing them would cause the
 * consumer's `take(catalogLoaded for source)` to block forever — the demand
 * loop never reloads a request that hasn't changed. Capture and the loop
 * compute the request from the same `galaxyCatalogRequest` and compare it
 * with `sameRequest`, so the two cannot drift out of agreement.
 *
 * Hover is NOT captured: `watchTierSaga` clears the hover slot unconditionally
 * across the swap (a stale hover over an evicted cloud would resolve to a
 * different galaxy). Capturing hover and then clearing it would fight; the clear
 * wins, so only select + focus flow through here.
 *
 * Structure / milkyWay refs are already durable by their id / singleton tag;
 * they survive the swap untouched and are skipped.
 *
 * Returns null from `focusIdOf` only when the cloud is absent or the ref has no
 * deep-link representation (Milky Way). The Milky Way guard above already skips
 * that arm, but the null guard below is the belt-and-suspenders safety that
 * keeps the return type `GalaxyReanchor[]` (string focusId, never null).
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

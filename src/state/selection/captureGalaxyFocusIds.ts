/**
 * captureGalaxyFocusIds — read the durable focus id of each galaxy-arm selection
 * ref BEFORE a tier swap evicts the old clouds. A galaxy ref is positional
 * (source+index), so after eviction the same index points at a different galaxy
 * (or none); encoding to the durable id here (while the OLD cloud is still
 * present) lets the saga re-resolve to the NEW index once the new tier loads.
 *
 * Only refs whose source actually reloads on the given swap are captured. Tier-
 * agnostic sources (2MRS, Famous) never emit a `catalogLoaded` on a tier swap,
 * so capturing them would cause the consumer's `take(catalogLoaded for source)`
 * to block forever. `tierTarget(src, prev) !== tierTarget(src, next)` is the
 * same predicate `makeRunTierTransition` uses — these two must stay in sync.
 *
 * Hover is NOT captured: `watchTier` clears the hover slot unconditionally
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
import { tierTarget } from '../../data/tierTargets';
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
    // Skip sources whose tier target is unchanged — they do NOT reload, so no
    // `catalogLoaded` will arrive and the consumer's `take` would block forever.
    if (tierTarget(ref.source, prevTier) === tierTarget(ref.source, nextTier)) continue;
    // focusIdOf returns null when the cloud is absent or the ref has no durable
    // representation (Milky Way, already guarded above). Skip nulls so the
    // return type carries only resolvable ids.
    const focusId = focusIdOf(ref, deps);
    if (focusId !== null) out.push({ slot, source: ref.source, focusId });
  }
  return out;
}

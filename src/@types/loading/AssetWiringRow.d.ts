/**
 * AssetWiringRow — one fetchable asset's lifecycle contract; `wireSlots`
 * iterates the registry array to build the engine's slot table. A row that
 * tracks a sibling's demand/priority/request is a `CompanionAssetRow`, folded
 * into one of these by `expandCompanionRows`.
 */

import type { AssetKey } from './AssetKey';
import type { AssetSlot } from './AssetSlot';
import type { SlotDeps } from './SlotDeps';
import type { DemandCtx } from './DemandCtx';
import type { Tier } from '../data/Tier';

export type AssetWiringRow<T = unknown, R = unknown> = {
  key: AssetKey;
  /**
   * Pure constructor: builds + subscribes + RETURNS the slot. Must NOT write
   * `state.assetSlots` and must NOT call `slot.load()` — `wireSlots` does both.
   */
  factory: (deps: SlotDeps) => AssetSlot<T, R>;
  /** Build the request from the current tier (void/empty for tier-agnostic). */
  req: (tier: Tier) => R;
  demand: (ctx: DemandCtx) => boolean;
  /**
   * Fetch rank on the one bounded-concurrency queue; LOWER is fetched first,
   * ranked by relevance to the camera's scale rung with payload size folded
   * into the integer by hand. Ranks are distinct on purpose: equal ranks fall
   * back to array order, which fetches the large file ahead of the small one.
   */
  priority: number;
  /**
   * The evict edge, checked while the slot is `ready`. Omitted ⇒ never evict.
   * Separate from `!demand` so the two edges carry hysteresis: both are false
   * in the band between load and evict radius, which `!demand` cannot encode.
   */
  release?: (ctx: DemandCtx) => boolean;
  /**
   * `'external'` when the slot is minted outside the registry (point sources,
   * body textures — built directly in `wireSlots`). The construction pass
   * skips these; the demand loop still evaluates their `demand`/`req`.
   */
  built?: 'external';
};

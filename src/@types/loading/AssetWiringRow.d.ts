/**
 * AssetWiringRow — one fetchable asset's lifecycle contract. `createLayers`
 * composes core's rows with every Layer's into `state.assetRows`, and the demand
 * loop walks that list. A row that tracks a sibling's
 * demand/priority/request is a `CompanionAssetRow`, folded into one of these.
 * `Key` narrows to the authoring Layer's own key type; core reads it as `AssetKey`.
 */

import type { AssetKey } from './AssetKey';
import type { AssetSlot } from './AssetSlot';
import type { AssetDemand } from './AssetDemand';
import type { Tier } from '../data/Tier';
import type { VisibilityAddress } from '../animation/VisibilityAddress';

export type AssetWiringRow<T = unknown, R = unknown, Key extends AssetKey = AssetKey> = {
  key: Key;
  /**
   * The slot this row drives, minted by whoever authors the row (a Layer's
   * `create`, or core's `meshAssetRows`) and never loaded by them:
   * `reevaluateDemand` owns when a slot loads.
   */
  slot: AssetSlot<T, R>;
  /** Build the request from the current tier (void/empty for tier-agnostic). */
  req: (tier: Tier) => R;
  /** When the slot loads and releases, read by `evaluateAssetDemand`. */
  demand: AssetDemand;
  /**
   * Fetch rank on the one bounded-concurrency queue; LOWER is fetched first,
   * ranked by relevance to the camera's scale rung with payload size folded
   * into the integer by hand. Ranks are distinct on purpose: equal ranks fall
   * back to array order, which fetches the large file ahead of the small one.
   */
  priority: number;
  /**
   * The visibility address (and item) this slot's data draws. Its target stays 0 until the
   * slot has a committed value, and every notification from the slot recomputes it, so a
   * commit fades the thing in and a `release()` fades it out. Only a slot that holds one
   * item's whole drawn data gates.
   */
  readonly gates?:
    | VisibilityAddress
    | { readonly address: VisibilityAddress; readonly item: string };
};

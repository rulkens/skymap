import type { Tier } from '../data/Tier';

/**
 * Uniform request shape for every companion asset slot a galaxy
 * catalog row can list under its `companions` field.  Tier-aware
 * fetchers consume `tier` to pick the right per-tier URL; tier-agnostic
 * fetchers ignore it.  Having one shape lets `loadCompanionAssets` be
 * a data-driven `state.assetSlots[ref]?.load({ tier })` with no
 * per-key switch.
 */
export type CompanionAssetReq = { tier: Tier };

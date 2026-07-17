import type { Tier } from '../../@types/data/Tier';

/**
 * clampTier — caps a requested tier at a per-body `ceiling` under the ordering
 * `small < medium < large`, returning whichever is smaller.
 *
 * The ceiling is a body's `maxTier` (`BODY_TEXTURE_REGISTRY`): a low-detail body
 * (Uranus, Neptune) only ships a `small` texture, so a `large` app-wide tier
 * request must fetch its `small` file rather than 404 on a texture that was
 * never built. This is a one-directional min — it never *upscales*: a `small`
 * request under a `large` ceiling stays `small`, because the app tier is the
 * demand and the ceiling only ever lowers it, never raises it.
 */
const TIER_ORDER: readonly Tier[] = ['small', 'medium', 'large'];

export function clampTier(tier: Tier, ceiling: Tier): Tier {
  return TIER_ORDER.indexOf(tier) <= TIER_ORDER.indexOf(ceiling) ? tier : ceiling;
}

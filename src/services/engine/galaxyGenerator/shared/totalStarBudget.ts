/**
 * totalStarBudget — how many sprite stars one galaxy is modelled with.
 *
 * The 20,000 floor is a hard minimum, not a taste choice: a smaller bag leaves
 * populations with single-digit counts and the disc stops reading as a disc.
 * `MilkyWayTuning`'s `starCount` slider documents the same floor — it lives
 * here so both tiers, and the analytic field's flux anchor, share one
 * derivation instead of re-deriving `max(20000, floor(...))` at each site.
 */
import type { GalaxyParams } from '../../../../@types/galaxy/GalaxyParams';

export function totalStarBudget(params: GalaxyParams): number {
  return Math.max(20000, Math.floor(params.starCount || 400000));
}

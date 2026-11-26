/** The three data-volume tiers, ascending. Runtime companion to Tier — every
 * site that needs the ladder as a value (clamping, iterating, tier-fitting)
 * reads this instead of re-spelling the tuple. */
export const TIER_LADDER = ['small', 'medium', 'large'] as const;

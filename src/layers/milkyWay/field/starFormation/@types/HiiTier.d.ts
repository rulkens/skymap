/**
 * HiiTier — the three HII sub-tiers, each with its own render
 * target/divisor/timing slot (`docs/research/milky-way/hii-regions.md`).
 * `'hii:extras'` is deliberately NOT a fourth kind — it stays the `extras`
 * target's single pass (see `hiiSplat/extrasFragment.wesl`'s header for why).
 */
export type HiiTier = 'shells' | 'young' | 'dig';

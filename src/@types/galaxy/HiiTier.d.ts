/**
 * HiiTier — the three HII sub-tiers, each with its own render
 * target/divisor/timing slot (`docs/research/milky-way/hii-regions.md`).
 * `'hii:extras'` is deliberately NOT a fourth kind — it stays `hiiTex`'s own
 * single pass (see `HiiTierSpec`'s own doc for why extras can't split this way).
 */
export type HiiTier = 'shells' | 'young' | 'dig';

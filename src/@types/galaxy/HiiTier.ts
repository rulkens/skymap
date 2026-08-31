/**
 * HiiTierKind — the three HII sub-tiers that each got their own render
 * target/divisor/timing slot once DIG's split (`docs/research/milky-way/
 * hii-regions.md`) generalized to shells and young stars too. `'hii:extras'`
 * is deliberately NOT a fourth kind — it stays `hiiTex`'s own single pass
 * (see `HiiTierSpec`'s own doc for why extras can't split this way).
 */
export type HiiTier = 'shells' | 'young' | 'dig';

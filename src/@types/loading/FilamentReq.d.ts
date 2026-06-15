import type { Tier } from '../data/Tier';

/**
 * The request shape `filamentFetcher` accepts. Tier alone — no source —
 * because filaments are a derived global asset, not a per-galaxy-catalog one.
 */
export type FilamentReq = { tier: Tier };

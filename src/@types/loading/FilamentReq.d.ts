import type { Tier } from '../data/Tier';

/**
 * The request shape `filamentFetcher` accepts. Tier alone — no source —
 * because filaments are a derived global asset, not a per-survey one.
 */
export type FilamentReq = { tier: Tier };

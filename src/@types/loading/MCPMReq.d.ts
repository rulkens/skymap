import type { Tier } from '../data/Tier';

/** Request shape for `mcpmFetcher`: tier alone — the cube isn't per-source. */
export type MCPMReq = { tier: Tier };

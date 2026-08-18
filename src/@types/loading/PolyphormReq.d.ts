import type { Tier } from '../data/Tier';

/** Request shape for `polyphormFetcher`: tier alone — the cube isn't per-source. */
export type PolyphormReq = { tier: Tier };

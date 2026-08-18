import type { Tier } from '../data/Tier';

/** Request shape for `polyphorm2MrsFetcher`: tier alone — the cube isn't per-source. */
export type Polyphorm2MRSReq = { tier: Tier };

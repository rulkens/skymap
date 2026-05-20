import type { Tier } from '../data/Tier';

/**
 * Request shape for `milliquasNamesFetcher`: tier alone — the names
 * sidecar isn't per-source (it's only ever Milliquas) but IS per-tier
 * because each tier's subsample keeps a different set of quasar rows.
 * Mirrors `MCPMReq` in shape and rationale.
 */
export type MilliquasNamesReq = { tier: Tier };

/**
 * PROBE_REFRESH_INTERVAL_MS — minimum age of a body's reflection probe before
 * the scheduler re-captures it. A probe sees its host and the once-baked sky,
 * neither of which moves observably in a 128 px reflection over two seconds;
 * the interval is what keeps six faces plus a prefilter off the per-frame cost.
 */

export const PROBE_REFRESH_INTERVAL_MS = 2000;

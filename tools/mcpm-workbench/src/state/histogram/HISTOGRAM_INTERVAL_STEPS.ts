// T20: the histogram PASS runs every step (encodeStep.ts) — cheap, only nDataPoints
// invocations do real work. What's worth throttling is the READBACK: mapAsync is a
// host round trip, and every sim step already queues one GPU submission of its own.
// Steps, not wall-clock, so the convergence plot's x-axis is exact step counts.
export const HISTOGRAM_INTERVAL_STEPS = 20;

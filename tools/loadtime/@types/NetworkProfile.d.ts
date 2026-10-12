export type NetworkProfile = {
  /** Round-trip latency added to every request, ms. */
  latencyMs: number;
  downKbps: number;
  upKbps: number;
  /** CPU slowdown multiplier (4 = a mid-range phone against this machine). */
  cpuRate: number;
};

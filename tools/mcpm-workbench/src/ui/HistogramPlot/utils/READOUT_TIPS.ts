export const READOUT_TIPS: readonly string[] = [
  'Mean log trace density over the histogram sample points (catalog positions, or random positions with jittered sampling on) — the convergence signal. The line under the bars plots its history; flat means the field has settled.',
  "Running maximum sampled density — the fork's atomicMax marker bin, not a count. The field's hot ceiling; a reference when sizing the path tracer's trace max majorant.",
  "Share of samples in the null bin (density ≤ 1e-5): places the swarm hasn't deposited yet. Expect it to fall as the network grows over the points.",
  'Bin scale — the 16 bars are log-spaced density bins in this base.',
];

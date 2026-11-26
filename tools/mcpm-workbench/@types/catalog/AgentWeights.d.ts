/**
 * AgentWeights — `deriveAgentWeights`'s output: per-point MCPM deposit weight,
 * plus how many points took the median fill (the trace sidecar's `nan_mass_filled`).
 */
export type AgentWeights = {
  readonly weights: Float32Array; // per data point, post-transform
  readonly nanCount: number;
};

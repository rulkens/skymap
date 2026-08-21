/**
 * AgentWeights — `deriveAgentWeights`'s output: per-point MCPM deposit weight
 * plus the NaN accounting the HUD needs (median fill is invisible in `weights`
 * itself, so the count/value are surfaced separately).
 */
export type AgentWeights = {
  readonly weights: Float32Array; // per data point, post-transform
  readonly nanCount: number;
  readonly medianLog10Mass: number;
};

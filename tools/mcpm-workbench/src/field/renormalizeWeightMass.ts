import { TOTAL_WEIGHT_MASS } from './deriveAgentWeights';

/**
 * renormalizeWeightMass — rescales weights to sum to TOTAL_WEIGHT_MASS again
 * (deriveAgentWeights' own final step, replayed post-cull: task S14's crop
 * leaves agents.weight — shared by the deposit and galaxyOverlayPass's
 * `weightScale = n/TOTAL_WEIGHT_MASS` — summing to less, breaking mean-1).
 */
export function renormalizeWeightMass(weights: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += weights[i]!;
  if (sum === 0) return weights;
  const scale = TOTAL_WEIGHT_MASS / sum;
  const out = new Float32Array(weights.length);
  for (let i = 0; i < weights.length; i++) out[i] = weights[i]! * scale;
  return out;
}

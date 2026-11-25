/**
 * deriveAgentWeights — linear catalog weight W → MCPM agent deposit weight.
 *
 * W is linear and positive (built-ins: stellar mass in 1e12 Msun, see
 * `massWeightFromLog10`). The port's formula, do not reorder: NaN entries take
 * the finite median → `(1e6 / n) * log10(1 + max(W, 0)) / mean(W)`, mean(W)
 * of the untransformed weights, not of the logs. The `max(W, 0)` clamp
 * guards the domain: a negative sentinel can pass `isFinite`, and `log10` of a
 * value ≤ -1 would poison the whole deposit with NaN. `uniform` mode (not in
 * the port) gives every point `1e6 / n` but still reports the NaN accounting.
 */
import type { AgentWeights } from '../../@types/AgentWeights';

const DEPOSIT_SCALE = 1e6; // the port's `1.0e6 / data_count` numerator

function median(sorted: readonly number[]): number {
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function deriveAgentWeights(
  log10StellarMass: Float32Array,
  mode: 'stellarMass' | 'uniform',
): AgentWeights {
  const n = log10StellarMass.length;

  const finiteSorted: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = log10StellarMass[i]!;
    if (!Number.isNaN(v)) finiteSorted.push(v);
  }
  finiteSorted.sort((a, b) => a - b);
  const nanCount = n - finiteSorted.length;
  const medianLog10Mass = median(finiteSorted);

  // No finite mass in the slice degrades stellarMass to uniform: medianLog10Mass
  // stays NaN (nothing to fill from) rather than poisoning every weight with NaN.
  const degradeToUniform = mode === 'uniform' || finiteSorted.length === 0;

  const weights = new Float32Array(n);
  if (degradeToUniform) {
    weights.fill(DEPOSIT_SCALE / n);
    return { weights, nanCount, medianLog10Mass };
  }

  let rawSum = 0;
  for (let i = 0; i < n; i++) {
    const v = log10StellarMass[i]!;
    const filled = Math.max(Number.isNaN(v) ? medianLog10Mass : v, 0);
    rawSum += filled;
    weights[i] = Math.log10(1 + filled);
  }
  const scale = DEPOSIT_SCALE / n / (rawSum / n);
  for (let i = 0; i < n; i++) weights[i] = weights[i]! * scale;

  return { weights, nanCount, medianLog10Mass };
}

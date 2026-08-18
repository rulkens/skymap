/**
 * deriveAgentWeights — catalog stellar mass → MCPM agent deposit weight.
 *
 * Fork-exact order (spec §6, §15 decision 8), do not reorder: NaN entries take
 * the finite median → `w = log10(1 + max(W, 0))` → divide by mean(w) → scale
 * by `1e6 / n_points`. The `max(W, 0)` clamp guards the domain — a catalog
 * sentinel can pass `isFinite` yet be far outside the ~8–12 range real masses
 * take, and `log10` of a value ≤ -1 there would poison the whole deposit with
 * NaN. `uniform` mode skips mass but still reports the NaN accounting.
 */
import type { AgentWeights } from '../../@types/AgentWeights';

function median(sorted: readonly number[]): number {
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
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

  const weights = new Float32Array(n);
  if (mode === 'uniform') {
    weights.fill(1);
  } else {
    for (let i = 0; i < n; i++) {
      const v = log10StellarMass[i]!;
      const filled = Number.isNaN(v) ? medianLog10Mass : v;
      weights[i] = Math.log10(1 + Math.max(filled, 0));
    }
  }

  let sum = 0;
  for (let i = 0; i < n; i++) sum += weights[i]!;
  const scale = 1e6 / n / (sum / n);
  for (let i = 0; i < n; i++) weights[i] = weights[i]! * scale;

  return { weights, nanCount, medianLog10Mass };
}

/**
 * computeSchechterRatios — per-galaxy Malmquist rebalance from the source's
 * Schechter LF: ratio = clamp(sqrt(n_mid / n(d)), 0.3, 1.2), where n(d) is the
 * predicted observable density at the galaxy's distance and n_mid its median.
 *
 * A rebalance, not a boost: the median pivot dims the dense near field about as
 * much as it lifts the sparse far field, so total alpha stays put — any uniform
 * ratio > 1 saturates millions of additively blended points. sqrt keeps the
 * bulk near 1 instead of pinned at a clamp edge; the clamp is dim-heavy for the
 * same blending reason. Degenerate rows (n(d) ≤ 0, NaN) get 1.
 */

import type { ComputeSchechterRatiosInput } from '../../@types/catalog/ComputeSchechterRatiosInput';
import {
  galaxyCatalogFluxLimit,
  galaxyCatalogSchechter,
} from '../../../src/data/galaxyCatalog/galaxyCatalogFluxLimits';
import { expectedNumberDensity } from '../../../src/utils/math/index';

const RATIO_MIN = 0.3;
const RATIO_MAX = 1.2;
// A 4096-row sample's median is within ~1% of the full one on this smooth,
// monotone distribution, at O(k log k) instead of O(N log N).
const SAMPLE_SIZE = 4096;

export function computeSchechterRatios(input: ComputeSchechterRatiosInput): Float32Array {
  const { cloud, source } = input;
  const mLim = galaxyCatalogFluxLimit(source);
  const schechter = galaxyCatalogSchechter(source);

  const nHereArr = new Float32Array(cloud.count);
  for (let i = 0; i < cloud.count; i++) {
    const dx = cloud.positions[i * 3 + 0]!;
    const dy = cloud.positions[i * 3 + 1]!;
    const dz = cloud.positions[i * 3 + 2]!;
    const dMpc = Math.hypot(dx, dy, dz);
    const nHere = expectedNumberDensity({ ...schechter, mLim, dMpc });
    nHereArr[i] = Number.isFinite(nHere) && nHere > 0 ? nHere : 0;
  }

  const stride = Math.max(1, Math.floor(cloud.count / SAMPLE_SIZE));
  const sample: number[] = [];
  for (let i = 0; i < cloud.count; i += stride) {
    const v = nHereArr[i]!;
    if (v > 0) sample.push(v);
  }
  sample.sort((a, b) => a - b);
  const nMid = sample.length > 0 ? sample[Math.floor(sample.length / 2)]! : 1;

  const ratios = new Float32Array(cloud.count);
  for (let i = 0; i < cloud.count; i++) {
    const nHere = nHereArr[i]!;
    ratios[i] = nHere <= 0 ? 1 : Math.max(RATIO_MIN, Math.min(RATIO_MAX, Math.sqrt(nMid / nHere)));
  }
  return ratios;
}

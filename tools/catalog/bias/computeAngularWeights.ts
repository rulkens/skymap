/**
 * computeAngularWeights — per-galaxy HEALPix angular re-weight for one source's
 * cloud: weight = clamp(median count of the galaxy's distance shell / count of
 * its (cell, shell) bin). Tames GLADE's pencil-beam jets, where the deepest
 * parent catalogue (SDSS) covers only part of the sky.
 *
 * Bins are per cloud, never global: a shared table would let one source's
 * footprint correct another's. NSIDE 32 (~1.8° cells) leaves tens-to-hundreds
 * of galaxies per populated cell; shells are log-spaced because GLADE spans
 * 1 Mpc–1 Gpc. Typed-array tables, not nested Maps: GLADE is ~2.5 M rows.
 */

import type { ComputeAngularWeightsInput } from '../../@types/catalog/ComputeAngularWeightsInput';
import { cartesianToRaDec } from '../../../src/utils/math/index';
import { healpixNest } from '../../../src/utils/math/healpixNest';

const NSIDE = 32;
const N_CELLS = 12 * NSIDE * NSIDE;
const N_SHELLS = 10;

// Asymmetric, dim-heavy: additive blending tolerates dimming but compounds a
// boost. In the deepest shells few cells are populated and their median is
// tiny, so a lone galaxy would get a multi-× boost and light a bright rim at
// the data edge — the 1.2 cap is the workaround for that radial side effect.
const WEIGHT_MIN = 0.3;
const WEIGHT_MAX = 1.2;

export function computeAngularWeights(input: ComputeAngularWeightsInput): Float32Array {
  const { cloud, weightMin = WEIGHT_MIN, weightMax = WEIGHT_MAX } = input;
  const N = cloud.count;
  const weights = new Float32Array(N);

  if (N === 0) return weights;

  const cellIdxArr = new Int32Array(N);
  const distArr = new Float32Array(N);
  let dMin = Infinity;
  let dMax = -Infinity;

  for (let i = 0; i < N; i++) {
    const x = cloud.positions[i * 3 + 0]!;
    const y = cloud.positions[i * 3 + 1]!;
    const z = cloud.positions[i * 3 + 2]!;
    const d = Math.hypot(x, y, z);
    distArr[i] = d;
    if (d > 0 && Number.isFinite(d)) {
      if (d < dMin) dMin = d;
      if (d > dMax) dMax = d;
    }
    const [raDeg, decDeg] = cartesianToRaDec(x, y, z);
    cellIdxArr[i] = healpixNest(raDeg, decDeg, NSIDE);
  }

  // No distance range to shell over: identity weights.
  if (!Number.isFinite(dMin) || !Number.isFinite(dMax) || dMin >= dMax) {
    weights.fill(1);
    return weights;
  }

  // counts[cell * N_SHELLS + shell]
  const counts = new Float32Array(N_CELLS * N_SHELLS);
  const shellIdxArr = new Int8Array(N);
  const invLogSpan = 1 / Math.log10(dMax / dMin);

  for (let i = 0; i < N; i++) {
    const d = distArr[i]!;
    let shell = 0;
    // Origin / NaN rows pin to shell 0 so they still count and get a divisor.
    if (d > 0 && Number.isFinite(d)) {
      shell = Math.floor(Math.log10(d / dMin) * invLogSpan * N_SHELLS);
      if (shell < 0) shell = 0;
      if (shell >= N_SHELLS) shell = N_SHELLS - 1;
    }
    shellIdxArr[i] = shell;
    counts[cellIdxArr[i]! * N_SHELLS + shell]! += 1;
  }

  // Median over POPULATED cells only: an empty cell is outside the footprint
  // at that shell, not evidence of low density. Median, not mean, so a few
  // footprint-edge hot cells don't inflate the reference.
  const medianPerShell = new Float32Array(N_SHELLS);
  const scratch = new Float32Array(N_CELLS);
  for (let s = 0; s < N_SHELLS; s++) {
    let len = 0;
    for (let c = 0; c < N_CELLS; c++) {
      const v = counts[c * N_SHELLS + s]!;
      if (v > 0) scratch[len++] = v;
    }
    if (len === 0) continue;
    const view = scratch.subarray(0, len);
    view.sort(); // typed-array sort is numeric
    const mid = len >> 1;
    medianPerShell[s] = len % 2 === 1 ? view[mid]! : (view[mid - 1]! + view[mid]!) / 2;
  }

  for (let i = 0; i < N; i++) {
    const shell = shellIdxArr[i]!;
    const localCount = counts[cellIdxArr[i]! * N_SHELLS + shell]!;
    const median = medianPerShell[shell]!;
    let w = 1;
    if (localCount > 0 && median > 0) {
      w = median / localCount;
      if (w < weightMin) w = weightMin;
      else if (w > weightMax) w = weightMax;
    }
    weights[i] = w;
  }

  return weights;
}

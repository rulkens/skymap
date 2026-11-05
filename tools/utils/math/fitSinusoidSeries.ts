/**
 * fitSinusoidSeries — fit an N-channel residual (near-uniform time grid) as a cubic in τ plus
 * sinusoids, greedily: FFT the remaining residual (×8 zero-pad, power summed over channels) to
 * bracket the strongest tone, refine its ω, add its cos and sin columns, and stop once the
 * channel-vector norm is within `stop` (in the channels' unit) everywhere.
 * Columns are orthonormalised incrementally (Gram–Schmidt, two passes), so every step is an
 * exact least-squares refit; the kept R turns the orthogonal coefficients back into plain
 * (ω, cos, sin) amplitudes. τ and phase conventions match `correctionSeriesAt`.
 */

import type { CorrectionSeries } from '../../../src/@types/scene/CorrectionSeries';
import { dot } from './dot';
import { fft } from './fft';

const ZERO_PAD = 8;
const GOLDEN = (Math.sqrt(5) - 1) / 2;
// Shrinks the two-bin bracket by 0.618^40 ≈ 4e-9: far below any phase error that matters.
const GOLDEN_ITERATIONS = 40;

export function fitSinusoidSeries(
  tJd: Float64Array,
  residualIn: readonly Float64Array[],
  startJd: number,
  endJd: number,
  stop: number,
  maxTerms: number,
): Pick<CorrectionSeries, 'poly' | 'terms'> {
  const n = tJd.length;
  // Uniform, except the last gap may be short so the grid can end exactly on `endJd`: an
  // unsampled tail is extrapolated, and drifts past the stop. The FFT only brackets ω, so
  // one sample slightly off its index slot is harmless; the refine and refit use true times.
  const stepDays = tJd[1]! - tJd[0]!;
  for (let i = 1; i < n; i++) {
    const gap = tJd[i]! - tJd[i - 1]!;
    const ok = i === n - 1 ? gap > 0 && gap <= stepDays : Math.abs(gap - stepDays) < 1e-6;
    if (!ok) throw new Error('fit: grid not uniform');
  }
  const dt = Float64Array.from(tJd, (t) => t - startJd);
  const tau = Float64Array.from(dt, (d) => (2 * d) / (endJd - startJd) - 1);

  const residual = residualIn.map((a) => Float64Array.from(a));
  const q: Float64Array[] = [];
  const rCols: Float64Array[] = []; // column j of the upper-triangular R
  const proj: number[][] = residual.map(() => []); // q_j · y, per channel

  const addColumn = (a: Float64Array): void => {
    const c = Float64Array.from(a);
    const rc = new Float64Array(q.length + 1);
    for (let pass = 0; pass < 2; pass++) {
      q.forEach((qj, j) => {
        const d = dot(qj, c);
        for (let i = 0; i < n; i++) c[i]! -= d * qj[i]!;
        rc[j]! += d;
      });
    }
    const norm = Math.sqrt(dot(c, c));
    if (norm < 1e-9 * Math.sqrt(dot(a, a))) throw new Error('fit: degenerate column');
    for (let i = 0; i < n; i++) c[i]! /= norm;
    rc[q.length] = norm;
    q.push(c);
    rCols.push(rc);
    residual.forEach((r, ch) => {
      const d = dot(c, r);
      for (let i = 0; i < n; i++) r[i]! -= d * c[i]!;
      proj[ch]!.push(d);
    });
  };
  const sample = new Array<number>(residual.length);
  const maxErr = (): number => {
    let m = 0;
    for (let i = 0; i < n; i++) {
      residual.forEach((r, c) => (sample[c] = r[i]!));
      m = Math.max(m, Math.hypot(...sample));
    }
    return m;
  };

  // Residual energy (all channels) a cos/sin pair at ω would remove, net of what the kept columns
  // already span. The bare periodogram ignores that overlap and is biased wherever a tone
  // correlates with the cubic or a neighbour, which costs extra terms to mop up.
  const capturedEnergy = (omega: number): number => {
    const c = Float64Array.from(dt, (d) => Math.cos(omega * d));
    const s = Float64Array.from(dt, (d) => Math.sin(omega * d));
    let gcc = dot(c, c);
    let gcs = dot(c, s);
    let gss = dot(s, s);
    for (const qj of q) {
      const qc = dot(qj, c);
      const qs = dot(qj, s);
      gcc -= qc * qc;
      gcs -= qc * qs;
      gss -= qs * qs;
    }
    const det = gcc * gss - gcs * gcs;
    let total = 0;
    for (const r of residual) {
      const bc = dot(r, c);
      const bs = dot(r, s);
      total += (gss * bc * bc - 2 * gcs * bc * bs + gcc * bs * bs) / det;
    }
    return total;
  };

  for (let p = 0; p <= 3; p++) addColumn(Float64Array.from(tau, (u) => u ** p));

  let m = 1;
  while (m < n * ZERO_PAD) m <<= 1;
  const re = new Float64Array(m);
  const im = new Float64Array(m);
  const power = new Float64Array(m / 2);
  const omegas: number[] = [];
  while (omegas.length < maxTerms && maxErr() > stop) {
    power.fill(0);
    for (const r of residual) {
      re.fill(0);
      im.fill(0);
      re.set(r);
      fft(re, im);
      for (let k = 1; k < m / 2; k++) power[k]! += re[k]! ** 2 + im[k]! ** 2;
    }
    let kb = 1;
    for (let k = 2; k < m / 2 - 1; k++) if (power[k]! > power[kb]!) kb = k;
    // The padded FFT only brackets the peak; a golden-section search inside the bracket
    // lands on it, so one term absorbs a tone instead of a cluster of neighbours.
    // Bin 0 is DC, where the sin column vanishes: keep the bracket at one padded bin or above.
    let lo = (2 * Math.PI * Math.max(kb - 1, 1)) / (m * stepDays);
    let hi = (2 * Math.PI * (kb + 1)) / (m * stepDays);
    let w1 = hi - GOLDEN * (hi - lo);
    let w2 = lo + GOLDEN * (hi - lo);
    let e1 = capturedEnergy(w1);
    let e2 = capturedEnergy(w2);
    for (let it = 0; it < GOLDEN_ITERATIONS; it++) {
      if (e1 < e2) {
        lo = w1;
        w1 = w2;
        e1 = e2;
        w2 = lo + GOLDEN * (hi - lo);
        e2 = capturedEnergy(w2);
      } else {
        hi = w2;
        w2 = w1;
        e2 = e1;
        w1 = hi - GOLDEN * (hi - lo);
        e1 = capturedEnergy(w1);
      }
    }
    const omega = (lo + hi) / 2;
    addColumn(Float64Array.from(dt, (d) => Math.cos(omega * d)));
    addColumn(Float64Array.from(dt, (d) => Math.sin(omega * d)));
    omegas.push(omega);
  }

  // Back-substitute R·x = qᵀy per channel: x are the plain-basis coefficients.
  const k = q.length;
  const coef = proj.map((d) => {
    const x = new Float64Array(k);
    for (let j = k - 1; j >= 0; j--) {
      let s = d[j]!;
      for (let l = j + 1; l < k; l++) s -= rCols[l]![j]! * x[l]!;
      x[j] = s / rCols[j]![j]!;
    }
    return x;
  });
  const at = (j: number): number[] => coef.map((x) => x[j]!);
  const terms = omegas.flatMap((omega, t) => [omega, ...at(4 + 2 * t), ...at(5 + 2 * t)]);
  return { poly: [at(0), at(1), at(2), at(3)], terms };
}

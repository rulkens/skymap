/**
 * correctionSeriesAt — evaluate a fitted `CorrectionSeries` at `simDays`, one value per channel,
 * summed in f64 (ω·dt reaches ~1e7 rad, past f32). `'hold'` clamps `simDays` into the span so
 * the edge value persists; `'off'` returns `undefined` outside `[startJd, endJd]`.
 */

import type { CorrectionSeries } from '../../@types/scene/CorrectionSeries';

export function correctionSeriesAt(
  s: CorrectionSeries,
  simDays: number,
  outside: 'hold' | 'off',
): number[] | undefined {
  if (outside === 'off' && (simDays < s.startJd || simDays > s.endJd)) return undefined;
  const dt = Math.min(Math.max(simDays, s.startJd), s.endJd) - s.startJd;
  const tau = (2 * dt) / (s.endJd - s.startJd) - 1;
  const [p0, p1, p2, p3] = s.poly;
  const channels = p0.length;
  const out = new Array<number>(channels);
  for (let c = 0; c < channels; c++) {
    out[c] = p0[c]! + tau * (p1[c]! + tau * (p2[c]! + tau * p3[c]!));
  }
  const terms = s.terms;
  const stride = 1 + 2 * channels;
  for (let i = 0; i < terms.length; i += stride) {
    const phase = terms[i]! * dt;
    const cos = Math.cos(phase);
    const sin = Math.sin(phase);
    for (let c = 0; c < channels; c++) {
      out[c]! += terms[i + 1 + c]! * cos + terms[i + 1 + channels + c]! * sin;
    }
  }
  return out;
}

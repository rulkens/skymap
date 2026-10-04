import { describe, it, expect } from 'vitest';
import { fitSinusoidSeries } from '../../../../tools/utils/math/fitSinusoidSeries';
import { ephemerisCorrectionMpc } from '../../../../src/utils/orbit/ephemerisCorrectionMpc';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';

const START = 2_415_020.5;
const END = START + 20_000;

// Cubic plus two sinusoids whose periods (333.3 d, 1777.7 d) fall between FFT bins.
function signal(t: number): [number, number, number] {
  const tau = (2 * (t - START)) / (END - START) - 1;
  const p1 = (2 * Math.PI * (t - START)) / 333.3;
  const p2 = (2 * Math.PI * (t - START)) / 1777.7;
  return [
    5000 + 800 * tau - 300 * tau ** 3 + 2000 * Math.cos(p1 + 0.4),
    -1200 * tau ** 2 + 1500 * Math.sin(p1 + 0.4) + 700 * Math.cos(p2),
    40 * tau + 900 * Math.sin(p2 - 1.1),
  ];
}

describe('fitSinusoidSeries', () => {
  it('fitSinusoidSeries recovers a synthetic two-term signal', () => {
    const step = 5;
    const tJd = Float64Array.from(
      { length: Math.floor((END - START) / step) + 1 },
      (_, i) => START + i * step,
    );
    const axes = [0, 1, 2].map((a) => Float64Array.from(tJd, (t) => signal(t)[a]!));
    const fit = fitSinusoidSeries(tJd, [axes[0]!, axes[1]!, axes[2]!], START, END, 1, 50);

    expect(fit.terms.length / 7).toBeLessThanOrEqual(4);
    const correction = { startJd: START, endJd: END, polyKm: fit.polyKm, terms: fit.terms };
    for (let t = START; t <= END; t += 1) {
      const [x, y, z] = ephemerisCorrectionMpc(correction, t).map((v) => v / SCALE_UNITS.KM_TO_MPC);
      const [sx, sy, sz] = signal(t);
      expect(Math.hypot(x! - sx, y! - sy, z! - sz)).toBeLessThanOrEqual(1);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { correctionSeriesAt } from '../../../src/utils/orbit/correctionSeriesAt';
import type { CorrectionSeries } from '../../../src/@types/scene/CorrectionSeries';

// A 400-day span, so dt = 100 sits at τ = −0.5 with round phases.
const SERIES: CorrectionSeries = {
  startJd: 2_400_000,
  endJd: 2_400_400,
  poly: [
    [100, -50, 7],
    [10, 0, 0],
    [0, 4, 0],
    [0, 0, 2],
  ],
  // prettier-ignore
  terms: [
    Math.PI / 100, 1000, 0, 0, 0, 500, 0, // phase π at dt = 100
    Math.PI / 400, 0, 0, 30, 0, 0, -20, // phase π/4 at dt = 100
  ],
};

describe('correctionSeriesAt', () => {
  it('evaluates polynomial and terms at a known instant', () => {
    // poly at τ = −0.5: x = 100 − 5, y = −50 + 1, z = 7 − 0.25.
    // term 1 (π): x −= 1000; term 2 (π/4): z += (30 − 20)/√2.
    const [x, y, z] = correctionSeriesAt(SERIES, 2_400_100, 'hold')!;
    expect(x).toBeCloseTo(95 - 1000, 6);
    expect(y).toBeCloseTo(-49, 6);
    expect(z).toBeCloseTo(6.75 + 10 / Math.SQRT2, 6);
  });

  it('holds the edge value outside the span', () => {
    const century = 36_525;
    expect(correctionSeriesAt(SERIES, SERIES.startJd - century, 'hold')).toEqual(
      correctionSeriesAt(SERIES, SERIES.startJd, 'hold'),
    );
    expect(correctionSeriesAt(SERIES, SERIES.endJd + century, 'hold')).toEqual(
      correctionSeriesAt(SERIES, SERIES.endJd, 'hold'),
    );
  });

  it("correctionSeriesAt 'off' returns undefined outside the span and the full value on its edges", () => {
    expect(correctionSeriesAt(SERIES, SERIES.startJd - 1e-6, 'off')).toBeUndefined();
    expect(correctionSeriesAt(SERIES, SERIES.endJd + 1e-6, 'off')).toBeUndefined();
    expect(correctionSeriesAt(SERIES, SERIES.startJd, 'off')).toEqual(
      correctionSeriesAt(SERIES, SERIES.startJd, 'hold'),
    );
    expect(correctionSeriesAt(SERIES, SERIES.endJd, 'off')).toEqual(
      correctionSeriesAt(SERIES, SERIES.endJd, 'hold'),
    );
  });
});

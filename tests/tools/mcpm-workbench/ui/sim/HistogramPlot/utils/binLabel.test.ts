import { describe, expect, it } from 'vitest';
import { binLabel } from '../../../../../../../tools/mcpm-workbench/src/ui/sim/HistogramPlot/utils/binLabel';

// histogram.wesl's binning, line for line: the label must name the decade a density lands in.
function shaderBin(density: number): number {
  if (!(density > 1e-5)) return 0;
  return 1 + Math.min(Math.max(0, Math.trunc(Math.log10(density) + 5)), 17 - 3);
}

const toLabel = (exponent: number) => (exponent < 0 ? `−${-exponent}` : `${exponent}`);

describe('binLabel', () => {
  it('marks the null bin apart from every density', () => {
    expect(binLabel(shaderBin(0))).toBe('∅');
    expect(binLabel(shaderBin(1e-5))).toBe('∅');
  });

  it('labels each decade bin with the exponent of the densities it holds', () => {
    for (let exponent = -5; exponent <= 8; exponent++) {
      expect(binLabel(shaderBin(3 * 10 ** exponent))).toBe(toLabel(exponent));
    }
  });

  it('marks the clamped last bin as open-ended', () => {
    expect(binLabel(shaderBin(3e9))).toBe('9+');
    expect(binLabel(shaderBin(3e12))).toBe('9+');
  });
});

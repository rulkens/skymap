import { describe, expect, it } from 'vitest';
import { engravedFrameLayout } from '../../../src/utils/antiqueChrome/engravedFrameLayout';
import { PANEL_FRAME } from '../../../src/data/ui/antiqueChrome';

describe('engravedFrameLayout', () => {
  it('lands the slice line a whole number of ladder cells past the band, so edges start on ink', () => {
    for (const cell of [3, 4.5, 7, 11]) {
      for (const ornament of [0, 14, 28, 48]) {
        const L = engravedFrameLayout({ ...PANEL_FRAME, cell, ornament });
        const cells = (L.slice - (L.bandAt + L.band)) / cell;
        expect(Math.abs(cells - Math.round(cells))).toBeLessThan(1e-9);
        expect(cells).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('keeps the corner slice clear of the ornament box', () => {
    const L = engravedFrameLayout(PANEL_FRAME);
    expect(L.slice).toBeGreaterThanOrEqual(L.border + 1 + PANEL_FRAME.ornament);
  });

  it('stacks the rules outside in and makes the border their total depth', () => {
    const L = engravedFrameLayout(PANEL_FRAME);
    const { outer, gap, hair, band } = PANEL_FRAME;
    expect(L.border).toBeCloseTo(outer + gap + hair + band + hair);
    const [last] = L.rules.slice(-1);
    expect(last![0] + last![1] / 2).toBeCloseTo(L.border);
    expect(L.tile).toBe(2 * PANEL_FRAME.cell);
  });
});

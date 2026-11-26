import { describe, expect, it } from 'vitest';
import {
  buildPaletteLut,
  PALETTE_IDS,
} from '../../../../../../src/data/volume/scalarFieldPalettes';
import { rampLut } from '../../../../../../src/utils/color/rampLut';
import { paletteGradientStops } from '../../../../../../tools/mcpm-workbench/src/utils/color/paletteGradientStops';

const channels = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe('paletteGradientStops', () => {
  it("starts and ends on the palette's own end colours", () => {
    const stops = paletteGradientStops(buildPaletteLut('viridis'));
    expect(stops[0]).toEqual({ offset: 0, color: '#440154' });
    expect(stops.at(-1)).toEqual({ offset: 1, color: '#fde725' });
  });

  it('keeps one stop per anchor of a five-anchor palette', () => {
    expect(paletteGradientStops(buildPaletteLut('viridis'))).toHaveLength(5);
  });

  it('draws every palette within 2/255 of its LUT at every entry', () => {
    for (const id of PALETTE_IDS) {
      const lut = buildPaletteLut(id);
      const stops = paletteGradientStops(lut);
      for (let i = 0; i < 256; i++) {
        const t = i / 255;
        const b = stops.findIndex((s) => s.offset >= t);
        const a = Math.max(0, b - 1);
        const u = b === a ? 0 : (t - stops[a]!.offset) / (stops[b]!.offset - stops[a]!.offset);
        const [ca, cb] = [channels(stops[a]!.color), channels(stops[b]!.color)];
        for (let c = 0; c < 3; c++) {
          expect(
            Math.abs(ca[c]! + (cb[c]! - ca[c]!) * u - lut[i * 4 + c]!),
            `${id} @${i}`,
          ).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  // Rounding moves a knot until the colour error reaches the tolerance: a few entries.
  it('keeps the positions of unevenly spaced anchors', () => {
    const lut = rampLut(
      [
        [0, 5, 5, 30],
        [0.4, 60, 30, 150],
        [0.7, 140, 80, 200],
        [1, 220, 180, 255],
      ],
      256,
    );
    const offsets = paletteGradientStops(lut).map((s) => s.offset);
    expect(offsets).toHaveLength(4);
    for (const [i, t] of [0, 0.4, 0.7, 1].entries())
      expect(Math.abs(offsets[i]! - t)).toBeLessThanOrEqual(3 / 255);
  });
});

import { describe, it, expect } from 'vitest';
import { textLayoutOf } from '../../../../src/services/gpu/labelLayout/textLayoutOf';
import { parseFontMetrics } from '../../../../src/services/gpu/labelLayout/fontMetrics';

const METRICS = parseFontMetrics({
  pages: ['x.png'],
  common: { lineHeight: 50, base: 38, scaleW: 512, scaleH: 512 },
  info: { face: 'X', size: 42 },
  distanceField: { fieldType: 'msdf', distanceRange: 4 },
  chars: [
    {
      id: 65,
      x: 0,
      y: 0,
      width: 30,
      height: 40,
      xoffset: 0,
      yoffset: 0,
      xadvance: 25,
      page: 0,
      chnl: 15,
    },
  ],
});

describe('textLayoutOf', () => {
  const metricsByFont = { cormorant: METRICS };

  it('keys the memo on alignment, not just the text', () => {
    const left = textLayoutOf(metricsByFont, { text: 'A', font: 'cormorant', alignX: 'left' });
    const center = textLayoutOf(metricsByFont, { text: 'A', font: 'cormorant', alignX: 'center' });
    expect(center.quads[0]!.localOffsetX).not.toBe(left.quads[0]!.localOffsetX);
  });

  it('returns the same object for repeated calls', () => {
    const label = { text: 'AA', font: 'cormorant' } as const;
    expect(textLayoutOf(metricsByFont, label)).toBe(textLayoutOf(metricsByFont, { ...label }));
  });

  it('does not share entries between metrics records', () => {
    const label = { text: 'AA', font: 'cormorant' } as const;
    expect(textLayoutOf({ cormorant: METRICS }, label)).not.toBe(
      textLayoutOf({ cormorant: METRICS }, label),
    );
  });

  it('measures null for text with no known glyphs', () => {
    expect(textLayoutOf(metricsByFont, { text: 'zzz', font: 'cormorant' }).bbox).toBeNull();
  });
});

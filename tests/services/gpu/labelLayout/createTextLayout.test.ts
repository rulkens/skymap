import { describe, it, expect } from 'vitest';
import { createTextLayout } from '../../../../src/services/gpu/labelLayout/createTextLayout';
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

describe('createTextLayout', () => {
  const textLayout = createTextLayout({ cormorant: METRICS });

  it('keys the memo on alignment, not just the text', () => {
    const left = textLayout.layout({ text: 'A', font: 'cormorant', alignX: 'left' });
    const center = textLayout.layout({ text: 'A', font: 'cormorant', alignX: 'center' });
    expect(center[0]!.localOffsetX).not.toBe(left[0]!.localOffsetX);
  });

  it('returns the same array instance for repeated calls', () => {
    const label = { text: 'AA', font: 'cormorant' } as const;
    expect(textLayout.layout(label)).toBe(textLayout.layout({ ...label }));
  });

  it('measures null for text with no known glyphs', () => {
    expect(textLayout.measure({ text: 'zzz', font: 'cormorant' })).toBeNull();
  });
});

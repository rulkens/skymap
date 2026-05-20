import { describe, it, expect } from 'vitest';
import { createLabelRenderer } from '../../../../src/services/gpu/renderers/labelRenderer';
import { parseFontMetrics } from '../../../../src/services/gpu/labels/fontMetrics';
import type { LoadedFontAtlases } from '../../../../src/@types/rendering/LoadedFontAtlases';

const FIXTURE_METRICS = parseFontMetrics({
  pages: ['x.png'],
  common: { lineHeight: 50, base: 38, scaleW: 512, scaleH: 512 },
  info: { face: 'X', size: 42 },
  distanceField: { fieldType: 'msdf', distanceRange: 16 },
  chars: [
    { id: 65, x: 0, y: 0, width: 30, height: 40, xoffset: 0, yoffset: 0, xadvance: 25, page: 0, chnl: 15 },
  ],
});
const FIXTURE_ATLASES: LoadedFontAtlases = { metricsByFont: { cormorant: FIXTURE_METRICS }, bitmaps: [] };
const newRenderer = () => createLabelRenderer(
  { device: null as unknown as GPUDevice, context: null as unknown as GPUCanvasContext,
    format: 'rgba16float' as GPUTextureFormat, canvas: null as unknown as HTMLCanvasElement },
  FIXTURE_ATLASES,
);

describe('LabelRenderer effect-field pack layout', () => {
  it('per-label storage record is 24 f32 slots (96 bytes)', () => {
    const r = newRenderer();
    r.setLabels([{ id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 0, font: 'cormorant' }]);
    // First label occupies slots 0..23.  The second label (if present)
    // would start at slot 24.  Assert by writing two labels and
    // inspecting the second label's worldPos slot.
    r.setLabels([
      { id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 0, font: 'cormorant' },
      { id: 'b', worldPos: [7, 8, 9], text: 'A', pixelSize: 0, font: 'cormorant' },
    ]);
    const buf2 = (r as unknown as { __debugLabelBuf(): Float32Array }).__debugLabelBuf();
    expect(buf2[24]).toBe(7);  // second label's worldPos.x
    expect(buf2[25]).toBe(8);
    expect(buf2[26]).toBe(9);
  });

  it('writes outlineColor (premultiplied) at slots 12..15', () => {
    const r = newRenderer();
    r.setLabels([{
      id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 0, font: 'cormorant',
      outlineColor: [1, 0, 0, 0.5],
    }]);
    const buf = (r as unknown as { __debugLabelBuf(): Float32Array }).__debugLabelBuf();
    expect(buf[12]).toBeCloseTo(0.5, 5); // 1 * 0.5
    expect(buf[13]).toBe(0);
    expect(buf[14]).toBe(0);
    expect(buf[15]).toBeCloseTo(0.5, 5);
  });

  it('writes glowColor (premultiplied) at slots 16..19', () => {
    const r = newRenderer();
    r.setLabels([{
      id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 0, font: 'cormorant',
      glowColor: [0, 0.5, 1, 0.8],
    }]);
    const buf = (r as unknown as { __debugLabelBuf(): Float32Array }).__debugLabelBuf();
    expect(buf[16]).toBe(0);
    expect(buf[17]).toBeCloseTo(0.4, 5); // 0.5 * 0.8
    expect(buf[18]).toBeCloseTo(0.8, 5); // 1 * 0.8
    expect(buf[19]).toBeCloseTo(0.8, 5);
  });

  it('writes outlineEmFrac at sizing.x (slot 8) and glowEmFrac at effects.x (slot 20)', () => {
    const r = newRenderer();
    r.setLabels([{
      id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 0, font: 'cormorant',
      outlineEmFrac: 0.07, glowEmFrac: 0.18,
    }]);
    const buf = (r as unknown as { __debugLabelBuf(): Float32Array }).__debugLabelBuf();
    expect(buf[8]).toBeCloseTo(0.07, 5);
    expect(buf[20]).toBeCloseTo(0.18, 5);
    // Reserved effects.y/z/w stay zero
    expect(buf[21]).toBe(0);
    expect(buf[22]).toBe(0);
    expect(buf[23]).toBe(0);
  });

  it('defaults all four new fields to zero when omitted', () => {
    const r = newRenderer();
    r.setLabels([{ id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 0, font: 'cormorant' }]);
    const buf = (r as unknown as { __debugLabelBuf(): Float32Array }).__debugLabelBuf();
    expect(buf[8]).toBe(0);   // outlineEmFrac
    expect(buf[12]).toBe(0); expect(buf[13]).toBe(0); expect(buf[14]).toBe(0); expect(buf[15]).toBe(0); // outlineColor
    expect(buf[16]).toBe(0); expect(buf[17]).toBe(0); expect(buf[18]).toBe(0); expect(buf[19]).toBe(0); // glowColor
    expect(buf[20]).toBe(0);  // glowEmFrac
  });
});

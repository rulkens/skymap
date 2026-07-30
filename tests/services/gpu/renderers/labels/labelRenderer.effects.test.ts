import { describe, it, expect } from 'vitest';
import { createLabelRenderer } from '../../../../../src/services/gpu/renderers/labels/labelRenderer';
import { parseFontMetrics } from '../../../../../src/services/gpu/labelLayout/fontMetrics';
import type { LoadedFontAtlases } from '../../../../../src/@types/rendering/LoadedFontAtlases';

const FIXTURE_METRICS = parseFontMetrics({
  pages: ['x.png'],
  common: { lineHeight: 50, base: 38, scaleW: 512, scaleH: 512 },
  info: { face: 'X', size: 42 },
  distanceField: { fieldType: 'msdf', distanceRange: 16 },
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
const FIXTURE_ATLASES: LoadedFontAtlases = {
  metricsByFont: { cormorant: FIXTURE_METRICS },
  bitmaps: [],
};
const newRenderer = () =>
  createLabelRenderer(
    {
      device: null as unknown as GPUDevice,
      context: null as unknown as GPUCanvasContext,
      format: 'rgba16float' as GPUTextureFormat,
      canvas: null as unknown as HTMLCanvasElement,
      hdrCapable: false,
    },
    'rgba16float',
    FIXTURE_ATLASES,
  );

describe('LabelRenderer effect-field pack layout', () => {
  it('per-label storage record is 16 f32 slots (64 bytes)', () => {
    const r = newRenderer();
    r.setLabels([
      { id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 0, font: 'cormorant' },
      { id: 'b', worldPos: [7, 8, 9], text: 'A', pixelSize: 0, font: 'cormorant' },
    ]);
    const buf = (r as unknown as { __debugLabelBuf(): Float32Array }).__debugLabelBuf();
    // Second label's worldPos starts at slot 16 (= 64-byte stride / 4).
    expect(buf[16]).toBe(7);
    expect(buf[17]).toBe(8);
    expect(buf[18]).toBe(9);
  });

  it('writes outlineColor (premultiplied) at slots 12..15', () => {
    const r = newRenderer();
    r.setLabels([
      {
        id: 'a',
        worldPos: [0, 0, 0],
        text: 'A',
        pixelSize: 0,
        font: 'cormorant',
        outlineColor: [1, 0, 0, 0.5],
      },
    ]);
    const buf = (r as unknown as { __debugLabelBuf(): Float32Array }).__debugLabelBuf();
    expect(buf[12]).toBeCloseTo(0.5, 5); // 1 * 0.5
    expect(buf[13]).toBe(0);
    expect(buf[14]).toBe(0);
    expect(buf[15]).toBeCloseTo(0.5, 5);
  });

  it('writes outlineEmFrac at sizing.x (slot 8)', () => {
    const r = newRenderer();
    r.setLabels([
      {
        id: 'a',
        worldPos: [0, 0, 0],
        text: 'A',
        pixelSize: 0,
        font: 'cormorant',
        outlineEmFrac: 0.07,
      },
    ]);
    const buf = (r as unknown as { __debugLabelBuf(): Float32Array }).__debugLabelBuf();
    expect(buf[8]).toBeCloseTo(0.07, 5);
  });

  it('defaults outline fields to zero when omitted', () => {
    const r = newRenderer();
    r.setLabels([{ id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 0, font: 'cormorant' }]);
    const buf = (r as unknown as { __debugLabelBuf(): Float32Array }).__debugLabelBuf();
    expect(buf[8]).toBe(0); // outlineEmFrac
    expect(buf[12]).toBe(0);
    expect(buf[13]).toBe(0);
    expect(buf[14]).toBe(0);
    expect(buf[15]).toBe(0);
  });
});

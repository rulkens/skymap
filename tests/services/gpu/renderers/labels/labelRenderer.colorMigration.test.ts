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

describe('LabelRenderer color migration to straight RGBA', () => {
  it('premultiplies straight RGBA on write to the storage buffer', () => {
    const r = createLabelRenderer(
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
    r.setLabels([
      {
        id: 'a',
        worldPos: [0, 0, 0],
        text: 'A',
        pixelSize: 0,
        font: 'cormorant',
        color: [1, 0.5, 0.25, 0.5],
      },
    ]);
    const buf = (r as unknown as { __debugLabelBuf(): Float32Array }).__debugLabelBuf();
    // color slot is bytes 16..31, f32 indices 4..7
    expect(buf[4]).toBeCloseTo(0.5, 5); // 1 * 0.5
    expect(buf[5]).toBeCloseTo(0.25, 5); // 0.5 * 0.5
    expect(buf[6]).toBeCloseTo(0.125, 5); // 0.25 * 0.5
    expect(buf[7]).toBeCloseTo(0.5, 5); // alpha unchanged
  });

  it('defaults to opaque white when color is omitted', () => {
    const r = createLabelRenderer(
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
    r.setLabels([{ id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 0, font: 'cormorant' }]);
    const buf = (r as unknown as { __debugLabelBuf(): Float32Array }).__debugLabelBuf();
    expect(buf[4]).toBe(1);
    expect(buf[5]).toBe(1);
    expect(buf[6]).toBe(1);
    expect(buf[7]).toBe(1);
  });
});

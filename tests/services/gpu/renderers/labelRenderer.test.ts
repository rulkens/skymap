import { describe, it, expect } from 'vitest';
import { LabelRenderer } from '../../../../src/services/gpu/renderers/labelRenderer';
import { parseFontMetrics } from '../../../../src/services/gpu/labels/fontMetrics';

// Minimal BMFont fixture: just the uppercase A (codepoint 65) so we can test
// that the renderer counts known glyphs and silently drops unknown ones.
const FIXTURE_METRICS = parseFontMetrics({
  pages: ['x.png'],
  common: { lineHeight: 50, base: 38, scaleW: 512, scaleH: 512 },
  info: { face: 'X', size: 42 },
  distanceField: { fieldType: 'msdf', distanceRange: 4 },
  chars: [
    { id: 65, x: 0, y: 0, width: 30, height: 40, xoffset: 0, yoffset: 0, xadvance: 25, page: 0, chnl: 15 },
  ],
});

// Build a LabelRenderer with a null device — the constructor and setLabels
// guard all GPU calls behind `if (this.device)`, so CPU state is safe to
// exercise in unit tests without a real WebGPU context.
const newRenderer = () => {
  const ctx = {
    device: null as unknown as GPUDevice,
    context: null as unknown as GPUCanvasContext,
    format: 'rgba16float' as GPUTextureFormat,
    canvas: null as unknown as HTMLCanvasElement,
  };
  const bitmap = null as unknown as ImageBitmap;
  return new LabelRenderer(ctx, FIXTURE_METRICS, bitmap);
};

describe('LabelRenderer (CPU state)', () => {
  it('starts with zero glyphs to draw', () => {
    const r = newRenderer();
    expect(r.glyphCount()).toBe(0);
  });

  it('counts glyphs across all labels after setLabels', () => {
    const r = newRenderer();
    r.setLabels([
      { id: 'a', worldPos: [0, 0, 0], text: 'AAA', pixelSize: 24 },
      { id: 'b', worldPos: [1, 0, 0], text: 'AA', pixelSize: 24 },
    ]);
    expect(r.glyphCount()).toBe(5);
    expect(r.labelCount()).toBe(2);
  });

  it('drops glyphs not present in metrics', () => {
    const r = newRenderer();
    // 'A中A' — 'A' is in metrics (id=65), '中' is not (id=20013).  We expect only the
    // two 'A' glyphs to be counted; the unknown character is silently skipped.
    r.setLabels([{ id: 'x', worldPos: [0, 0, 0], text: 'A中A', pixelSize: 24 }]);
    expect(r.glyphCount()).toBe(2);
  });

  it('replaces (not appends) on subsequent setLabels', () => {
    const r = newRenderer();
    r.setLabels([{ id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 24 }]);
    r.setLabels([{ id: 'b', worldPos: [0, 0, 0], text: 'AAA', pixelSize: 24 }]);
    expect(r.labelCount()).toBe(1);
    expect(r.glyphCount()).toBe(3);
  });
});

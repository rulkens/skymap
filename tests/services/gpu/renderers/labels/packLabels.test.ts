import { describe, it, expect } from 'vitest';
import { packLabels } from '../../../../../src/services/gpu/renderers/labels/packLabels';
import { parseFontMetrics } from '../../../../../src/services/gpu/labelLayout/fontMetrics';
import {
  GLYPH_INSTANCE_BYTES,
  LABEL_DATA_BYTES,
} from '../../../../../src/data/labels/labelBufferStrides';
import type { Label2D } from '../../../../../src/@types/rendering/Label2D';

// Minimal BMFont fixture: just the uppercase A (codepoint 65), so unknown
// characters exercise the silent-drop path.
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
const LABEL_SLOTS = LABEL_DATA_BYTES / 4;
const GLYPH_SLOTS = GLYPH_INSTANCE_BYTES / 4;

function pack(labels: Label2D[], maxGlyphs = 64) {
  const labelF32 = new Float32Array(Math.max(labels.length, 1) * LABEL_SLOTS);
  const glyphBuf = new ArrayBuffer(maxGlyphs * GLYPH_INSTANCE_BYTES);
  const glyphF32 = new Float32Array(glyphBuf);
  const glyphU32 = new Uint32Array(glyphBuf);
  const glyphCount = packLabels({
    labels,
    metricsByFont: { cormorant: METRICS },
    layerIndexOf: { cormorant: 0 } as never,
    labelF32,
    glyphF32,
    glyphU32,
    maxGlyphs,
  });
  return { buf: labelF32, glyphCount, glyphU32 };
}

function label(over: Partial<Label2D> & { id: string }): Label2D {
  return { worldPos: [0, 0, 0], text: 'A', pixelSize: 0, font: 'cormorant', ...over };
}

describe('packLabels glyphs', () => {
  it('drops glyphs not present in metrics', () => {
    // 'A中A': only the two 'A' glyphs are in the metrics.
    expect(pack([label({ id: 'x', text: 'A中A' })]).glyphCount).toBe(2);
  });

  it('counts every label glyph and indexes each glyph to its label', () => {
    const { glyphCount, glyphU32 } = pack([
      label({ id: 'a', text: 'A' }),
      label({ id: 'b', text: 'AA' }),
    ]);
    expect(glyphCount).toBe(3);
    expect([0, 1, 2].map((g) => glyphU32[g * GLYPH_SLOTS + 8])).toEqual([0, 1, 1]);
  });

  it('keeps later labels indexed correctly when an earlier label has no glyphs', () => {
    const { glyphU32 } = pack([label({ id: 'a', text: '中' }), label({ id: 'b', text: 'A' })]);
    expect(glyphU32[8]).toBe(1);
  });

  it('stops writing glyphs at maxGlyphs', () => {
    expect(pack([label({ id: 'a', text: 'AAAAA' })], 3).glyphCount).toBe(3);
  });
});

describe('packLabels storage record', () => {
  it('strides records by 24 f32 slots (96 bytes)', () => {
    const { buf } = pack([label({ id: 'a' }), label({ id: 'b', worldPos: [7, 8, 9] })]);
    // The trailing subjectPos vec4 needs 16-byte alignment, so the struct's 72
    // written bytes round up to 96, not 80.
    expect([buf[24], buf[25], buf[26]]).toEqual([7, 8, 9]);
  });

  it('packs the unscaled worldEmMpc in slot 3', () => {
    const { buf } = pack([label({ id: 'a', worldEmMpc: 0.25 })]);
    expect(buf[3]).toBe(0.25);
  });

  it('premultiplies straight RGBA on write', () => {
    const { buf } = pack([label({ id: 'a', color: [1, 0.5, 0.25, 0.5] })]);
    expect(buf[4]).toBeCloseTo(0.5, 5);
    expect(buf[5]).toBeCloseTo(0.25, 5);
    expect(buf[6]).toBeCloseTo(0.125, 5);
    expect(buf[7]).toBeCloseTo(0.5, 5); // alpha unchanged
  });

  it('defaults to opaque white when color is omitted', () => {
    const { buf } = pack([label({ id: 'a' })]);
    expect([buf[4], buf[5], buf[6], buf[7]]).toEqual([1, 1, 1, 1]);
  });

  it('defaults subjectPos to worldPos when occludeSubjectPos is unset', () => {
    const { buf } = pack([label({ id: 'a', worldPos: [1, 2, 3] })]);
    expect([buf[20], buf[21], buf[22], buf[23]]).toEqual([1, 2, 3, 0]);
  });

  it('writes occludeSubjectPos at slots 20..22 when a producer sets it', () => {
    const { buf } = pack([label({ id: 'a', worldPos: [1, 2, 3], occludeSubjectPos: [4, 5, 6] })]);
    expect([buf[20], buf[21], buf[22]]).toEqual([4, 5, 6]);
  });

  it('writes outlineColor (premultiplied) at slots 12..15', () => {
    const { buf } = pack([label({ id: 'a', outlineColor: [1, 0, 0, 0.5] })]);
    expect(buf[12]).toBeCloseTo(0.5, 5);
    expect(buf[13]).toBe(0);
    expect(buf[14]).toBe(0);
    expect(buf[15]).toBeCloseTo(0.5, 5);
  });

  it('writes outlineEmFrac at sizing.x (slot 8)', () => {
    const { buf } = pack([label({ id: 'a', outlineEmFrac: 0.07 })]);
    expect(buf[8]).toBeCloseTo(0.07, 5);
  });

  it('defaults outline fields to zero when omitted', () => {
    const { buf } = pack([label({ id: 'a' })]);
    expect([buf[8], buf[12], buf[13], buf[14], buf[15]]).toEqual([0, 0, 0, 0, 0]);
  });
});

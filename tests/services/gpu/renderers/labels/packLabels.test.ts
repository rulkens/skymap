import { describe, it, expect } from 'vitest';
import { packLabels } from '../../../../../src/services/gpu/renderers/labels/packLabels';
import { parseFontMetrics } from '../../../../../src/services/gpu/labelLayout/fontMetrics';
import {
  GLYPH_INSTANCE_BYTES,
  LABEL_DATA_BYTES,
  LABEL_DATA_OFFSETS,
} from '../../../../../src/data/labels/labelBufferStrides';
import { LABEL_LIFT } from '../../../../../src/data/labels/labelLift';
import { textLayoutOf } from '../../../../../src/services/gpu/labelLayout/textLayoutOf';
import type { Label2D } from '../../../../../src/@types/rendering/Label2D';
import { LABEL_EM_PX_RETUNE } from '../../../../../src/data/labels/labelSizingDefaults';

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
  const labelBuf = new ArrayBuffer(Math.max(labels.length, 1) * LABEL_DATA_BYTES);
  const labelF32 = new Float32Array(labelBuf);
  const labelU32 = new Uint32Array(labelBuf);
  const glyphBuf = new ArrayBuffer(maxGlyphs * GLYPH_INSTANCE_BYTES);
  const glyphF32 = new Float32Array(glyphBuf);
  const glyphU32 = new Uint32Array(glyphBuf);
  const glyphCount = packLabels({
    labels,
    metricsByFont: { cormorant: METRICS },
    layerIndexOf: { cormorant: 0 } as never,
    labelF32,
    labelU32,
    glyphF32,
    glyphU32,
    maxGlyphs,
  });
  return { buf: labelF32, u32: labelU32, glyphCount, glyphU32 };
}

function label(over: Partial<Label2D> & { id: string }): Label2D {
  return { worldPos: [0, 0, 0], text: 'A', pixelSize: 0, font: 'cormorant', ...over };
}

describe('packLabels glyphs', () => {
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
    expect([buf[LABEL_SLOTS], buf[LABEL_SLOTS + 1], buf[LABEL_SLOTS + 2]]).toEqual([7, 8, 9]);
  });

  it('packs worldEmMpc times the em retune in slot 3, which the shader no longer applies', () => {
    const { buf } = pack([label({ id: 'a', worldEmMpc: 0.25 })]);
    expect(buf[3]).toBe(Math.fround(0.25 * LABEL_EM_PX_RETUNE));
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

  describe('lift', () => {
    const slot = (field: keyof typeof LABEL_DATA_OFFSETS) => LABEL_DATA_OFFSETS[field] / 4;

    it('writes the subject radius, the leader and where it starts', () => {
      const { buf, u32 } = pack([
        label({
          id: 'a',
          lift: {
            radiusMpc: 0.5,
            leader: { widthPx: 2.5, color: [1, 0, 0, 1], base: 'rim', gapPx: 4 },
          },
        }),
      ]);
      expect(buf[slot('radiusMpc')]).toBe(0.5);
      expect(buf[slot('leaderGapPx')]).toBe(4);
      expect(buf[slot('leaderWidthPx')]).toBe(2.5);
      expect(u32[slot('lift')]).toBe(LABEL_LIFT.leaderFromRim);
      expect(u32[slot('leaderRgba')]).toBe(0xff0000ff);
    });

    it("draws a leader without a colour of its own in the label's", () => {
      const { u32 } = pack([
        label({
          id: 'a',
          color: [0, 1, 0, 1],
          lift: { radiusMpc: 0, leader: { widthPx: 1, base: 'centre', gapPx: 0 } },
        }),
      ]);
      expect(u32[slot('lift')]).toBe(LABEL_LIFT.leaderFromCentre);
      expect(u32[slot('leaderRgba')]).toBe(0xff00ff00);
    });

    it('marks an unlifted label so a recycled slot draws no stale leader', () => {
      const { buf, u32 } = pack([label({ id: 'a' })]);
      expect(u32[slot('lift')]).toBe(LABEL_LIFT.none);
      expect(buf[slot('leaderWidthPx')]).toBe(0);
    });

    it("writes the text's ink bottom in atlas px", () => {
      const a = label({ id: 'a' });
      const { buf } = pack([a]);
      expect(buf[slot('inkBottom')]).toBe(textLayoutOf({ cormorant: METRICS }, a).bbox!.maxY);
    });
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

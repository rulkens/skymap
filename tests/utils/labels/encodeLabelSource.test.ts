import { describe, expect, it } from 'vitest';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { LabelDescription } from '../../../src/@types/rendering/LabelDescription';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { encodeLabelSource } from '../../../src/utils/labels/encodeLabelSource';
import { createLabelRecords } from '../../../src/utils/labels/createLabelRecords';
import { labelSource } from '../../../src/utils/labels/labelSource';
import { writeHiLoVertex } from '../../../src/utils/math/writeHiLoVertex';
import { packRgba8Unorm } from '../../../src/utils/color/packRgba8Unorm';
import { packSelection } from '../../../src/data/selectionEncoding';
import { LABEL_RECORD, LABEL_RECORD_WORDS } from '../../../src/data/labels/labelRecordLayout';
import { LABEL_STYLE_IDS } from '../../../src/data/labels/labelStyles';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { LETTER_A_METRICS } from '../../helpers/labels/letterAMetrics';

const state = {} as EngineState;
const records = () => createLabelRecords(8, 64, LETTER_A_METRICS);

describe('encodeLabelSource', () => {
  it('encodeLabelSource writes the described label', () => {
    const into = records();
    const described: LabelDescription = {
      text: 'AA',
      position: [1, 2, 3],
      subjectRadiusMpc: 0.5,
      color: [1, 0.5, 0, 1],
      priority: 7,
      pick: { code: 3, index: 4 },
      revealBand: { fullAt: 1, goneAt: 2 },
      style: 'famousGalaxy',
    };
    const source = labelSource({
      slab: 0,
      toggle: 'body',
      style: 'caption',
      items: () => ['skipped', 'kept', 'anchored'],
      describe: (item: string) =>
        item === 'skipped'
          ? null
          : item === 'kept'
            ? described
            : { text: 'A', position: { anchorId: 'earth' }, fadeKey: 'planets' },
    });

    expect(encodeLabelSource(source, state, into, 0)).toBe(2);

    const kept = Array.from(into.u32.subarray(0, LABEL_RECORD_WORDS));
    const f32 = (word: number) => Math.fround(into.f32[word]!);
    expect([f32(0), f32(1), f32(2)]).toEqual([1, 2, 3]);
    expect([f32(3), f32(4), f32(5), f32(6), f32(7)]).toEqual([0.5, 0, 0, 0, 0]);
    expect(kept.slice(8, 13)).toEqual([
      packSelection(3, 5),
      LABEL_STYLE_IDS.indexOf('famousGalaxy'),
      packRgba8Unorm([1, 0.5, 0, 1]),
      0,
      2,
    ]);
    expect([f32(13), f32(14), f32(15)]).toEqual([70_000, 1, 2]);

    const anchored = Array.from(into.u32.subarray(LABEL_RECORD_WORDS, 2 * LABEL_RECORD_WORDS));
    // The caption style's own priority band, no pick, no tint, glyphs after the first label's two.
    expect(anchored.slice(8, 13)).toEqual([0, LABEL_STYLE_IDS.indexOf('caption'), 0, 2, 1]);
    expect(into.f32[LABEL_RECORD_WORDS + 15]).toBe(Infinity);
    expect(into.anchorIds.slice(0, 2)).toEqual([null, 'earth']);
    expect(into.fadeKeys.slice(0, 2)).toEqual([null, 'planets']);
    expect(into.glyphU32[10 * 2 + 8]).toBe(1);
  });

  it('a source is described again only when its change value differs', () => {
    const into = records();
    let version = 1;
    let calls = 0;
    const source = labelSource({
      slab: 0,
      toggle: 'body',
      style: 'caption',
      changes: () => version,
      items: () => ['x'],
      describe: () => {
        calls++;
        return { text: 'A', position: [0, 0, 0] };
      },
    });

    encodeLabelSource(source, state, into, 0);
    encodeLabelSource(source, state, into, 0);
    expect(calls).toBe(1);
    version = 2;
    encodeLabelSource(source, state, into, 0);
    expect(calls).toBe(2);
    // Same value, but an earlier source grew: the records move, so they are written again.
    encodeLabelSource(source, state, into, 1);
    expect(calls).toBe(3);
  });

  it('a later source is written again when an earlier one changes its count or glyphs', () => {
    const into = records();
    let names = ['A'];
    const first = labelSource({
      slab: 0,
      toggle: 'body',
      style: 'caption',
      changes: () => names,
      items: () => names,
      describe: (text: string) => ({ text, position: [0, 0, 0] }),
    });
    const second = labelSource({
      slab: 0,
      toggle: 'body',
      style: 'caption',
      items: () => ['A'],
      describe: (text: string) => ({ text, position: [0, 0, 0] }),
    });
    const encode = () => {
      const count = encodeLabelSource(first, state, into, 0);
      return count + encodeLabelSource(second, state, into, count);
    };
    // The second source's record: its glyph start sits right after the first source's glyphs.
    const secondGlyphStart = (at: number) =>
      into.u32[at * LABEL_RECORD_WORDS + LABEL_RECORD.glyphs];
    expect(encode()).toBe(2);
    names = ['AAA'];
    expect(encode()).toBe(2);
    expect(secondGlyphStart(1)).toBe(3);
    names = ['A', 'AA'];
    expect(encode()).toBe(3);
    expect(secondGlyphStart(2)).toBe(3);
  });

  it('a label whose glyphs do not all fit is dropped whole', () => {
    const into = createLabelRecords(8, 5, LETTER_A_METRICS);
    const source = labelSource({
      slab: 0,
      toggle: 'body',
      style: 'caption',
      items: () => ['AAA', 'AAA', 'AA'],
      describe: (text: string) => ({ text, position: [0, 0, 0] }),
    });
    expect(encodeLabelSource(source, state, into, 0)).toBe(2);
    const glyphCount = (at: number) => into.u32[at * LABEL_RECORD_WORDS + LABEL_RECORD.glyphCount];
    expect([glyphCount(0), glyphCount(1)]).toEqual([3, 2]);
  });

  it('hi/lo position keeps millimetre precision 1 AU from the origin', () => {
    const au = SCALE_UNITS.AU_TO_MPC;
    const m = SCALE_UNITS.M_TO_MPC;
    const eye: Vec3 = [au, 0.3 * au, -0.2 * au];
    const offsetM: Vec3 = [1, 2, -0.5];
    const at: Vec3 = [eye[0] + offsetM[0] * m, eye[1] + offsetM[1] * m, eye[2] + offsetM[2] * m];
    const into = records();
    const source = labelSource({
      slab: 0,
      toggle: 'body',
      style: 'caption',
      items: () => [at],
      describe: (position: Vec3) => ({ text: 'A', position }),
    });
    encodeLabelSource(source, state, into, 0);

    const cam = new Float32Array(6);
    writeHiLoVertex(eye, 0, cam, 0);
    const f = Math.fround;
    for (let k = 0; k < 3; k++) {
      // The shader's subtraction, in f32: (atHi − camHi) + (atLo − camLo).
      const viewMpc = f(f(into.f32[k]! - cam[k]!) + f(into.f32[4 + k]! - cam[3 + k]!));
      expect(Math.abs(viewMpc / m - offsetM[k]!)).toBeLessThan(1e-3);
    }
  });
});

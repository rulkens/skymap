/**
 * The record words cross from TS into `vertex.wesl` with no compiler between them.
 * The shader's decode is reproduced here from the shader's own constants (read
 * from its text), so a drift in either the packer or the WESL masks and shifts
 * fails as a field that does not survive the round trip.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  GPU_ABSMAG_SHIFT,
  GPU_COLOR_SHIFT,
  GPU_RECORD_WORDS,
  packStarGpuRecords,
} from '../../../src/utils/star/packStarGpuRecords';
import {
  colorIdxToBpRp,
  lutIndexToAbsMag,
  STAR_ABSMAG_LEVELS,
  STAR_COLORIDX_LEVELS,
} from '../../../src/data/starCatalog/starCatalogFormat';
import { OFFSET_FRACTION_LEVELS } from '../../../src/data/octree/octreeFormat';

const vertex = readFileSync(
  join(process.cwd(), 'src/services/gpu/shaders/starCatalog/vertex.wesl'),
  'utf-8',
);

function weslU32(name: string): number {
  const m = new RegExp(`const\\s+${name}\\s*:\\s*u32\\s*=\\s*(0x[0-9a-f]+|\\d+)u;`).exec(vertex);
  if (!m) throw new Error(`vertex.wesl lacks const ${name}`);
  return Number(m[1]);
}

/** `vertex.wesl`'s record decode. */
function shaderUnpack(w0: number, w1: number) {
  const mask = weslU32('OFFSET_MASK');
  return {
    offset: [w0 & mask, w0 >>> weslU32('GPU_Y_SHIFT'), w1 & mask],
    absMagIdx: (w1 >>> weslU32('GPU_ABSMAG_SHIFT')) & weslU32('GPU_ABSMAG_MASK'),
    colorIdx: (w1 >>> weslU32('GPU_COLOR_SHIFT')) & weslU32('GPU_COLOR_MASK'),
  };
}

describe('packStarGpuRecords', () => {
  it('word layout round-trips the shader unpack', () => {
    const max = OFFSET_FRACTION_LEVELS - 1;
    const records = [
      { offset: [0, 0, 0], absMagIdx: 0, colorIdx: 0 },
      {
        offset: [max, max, max],
        absMagIdx: STAR_ABSMAG_LEVELS - 1,
        colorIdx: STAR_COLORIDX_LEVELS - 1,
      },
      { offset: [12345, 54321, 1], absMagIdx: 57, colorIdx: 11 },
    ];
    const words = packStarGpuRecords({
      count: records.length,
      offset: Uint16Array.from(records.flatMap((r) => r.offset)),
      absMag: Float32Array.from(records.map((r) => lutIndexToAbsMag(r.absMagIdx))),
      colourIndex: Float32Array.from(records.map((r) => colorIdxToBpRp(r.colorIdx))),
    });

    const offsetScale = /const\s+OFFSET_SCALE\s*:\s*f32\s*=\s*([0-9.e-]+);/.exec(vertex)?.[1];
    expect(Number(offsetScale)).toBe(1 / OFFSET_FRACTION_LEVELS);
    expect(weslU32('GPU_ABSMAG_SHIFT')).toBe(GPU_ABSMAG_SHIFT);
    expect(weslU32('GPU_COLOR_SHIFT')).toBe(GPU_COLOR_SHIFT);
    records.forEach((r, i) => {
      const w = i * GPU_RECORD_WORDS;
      expect(shaderUnpack(words[w]!, words[w + 1]!)).toEqual(r);
    });
  });
});

/**
 * Parity guard: the star cut's WESL constants are hand-mirrored from
 * `starCutLayout.ts` (`?static` linking injects no values). A drift is
 * invisible until the GPU addresses the wrong word, so the test reads the
 * shader text and compares. Pattern of `constants.parity.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CUT_BINS,
  CUT_HIST_WORDS,
  CUT_DRAWS_WORDS,
  CUT_MAX_VIEWS,
  CUT_WORKGROUP,
  LEAF_BLOCK_SHIFT,
  LEAF_BLOCK_INDEX_SHIFT,
  GRID_AXIS_BITS,
  LEVEL_BITS,
  RECORD_COUNT_SHIFT,
  DRAW_RECORD_WORDS,
} from '../../../../src/layers/starCatalog/render/starCutLayout';

function shader(file: string): string {
  return readFileSync(join(process.cwd(), 'src/services/gpu/shaders/starCatalog', file), 'utf-8');
}

function weslConst(text: string, name: string): number {
  const m = new RegExp(`const\\s+${name}\\s*:\\s*u32\\s*=\\s*(\\d+)u\\s*;`).exec(text);
  expect(m, `const ${name} missing`).not.toBeNull();
  return Number(m![1]);
}

describe('starCatalog cut WESL <-> starCutLayout.ts parity', () => {
  const cut = shader('cut.wesl');
  const cutIo = shader('cutIo.wesl');

  it('scalar constants match', () => {
    expect(weslConst(cut, 'CUT_BINS')).toBe(CUT_BINS);
    expect(weslConst(cutIo, 'LEAF_BLOCK_SHIFT')).toBe(LEAF_BLOCK_SHIFT);
    expect(weslConst(cutIo, 'LEAF_BLOCK_INDEX_SHIFT')).toBe(LEAF_BLOCK_INDEX_SHIFT);
    expect(weslConst(cutIo, 'GRID_AXIS_BITS')).toBe(GRID_AXIS_BITS);
    expect(weslConst(cutIo, 'LEVEL_BITS')).toBe(LEVEL_BITS);
    expect(weslConst(cutIo, 'RECORD_COUNT_SHIFT')).toBe(RECORD_COUNT_SHIFT);
    expect(weslConst(cut, 'DRAW_RECORD_WORDS')).toBe(DRAW_RECORD_WORDS);
    expect(weslConst(cutIo, 'CUT_MAX_VIEWS')).toBe(CUT_MAX_VIEWS);
  });

  it('workgroup sizes and array lengths match', () => {
    const sizes = [...cut.matchAll(/@workgroup_size\((\d+)\)/g)].map((m) => Number(m[1]));
    expect(sizes).toContain(CUT_WORKGROUP);
    expect(cut).toContain(`array<atomic<u32>, ${CUT_HIST_WORDS}>`);
    expect(cut).toContain(`array<atomic<u32>, ${CUT_DRAWS_WORDS}>`);
    expect(cutIo).toContain(`array<vec4<f32>, ${CUT_MAX_VIEWS * 6}>`);
  });
});

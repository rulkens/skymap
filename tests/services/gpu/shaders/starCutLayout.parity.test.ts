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
  CUT_HIST_WORDS,
  CUT_DRAWS_WORDS,
  CUT_MAX_VIEWS,
  CUT_WORKGROUP,
  LEAF_BLOCK_SHIFT,
  LEAF_BLOCK_INDEX_SHIFT,
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
  const vertex = shader('vertex.wesl');

  it('scalar constants match', () => {
    expect(weslConst(cut, 'CUT_BINS')).toBe(CUT_HIST_WORDS - 1);
    expect(weslConst(cut, 'LEAF_BLOCK_SHIFT')).toBe(LEAF_BLOCK_SHIFT);
    expect(weslConst(cut, 'LEAF_BLOCK_INDEX_SHIFT')).toBe(LEAF_BLOCK_INDEX_SHIFT);
    expect(weslConst(cutIo, 'CUT_MAX_VIEWS')).toBe(CUT_MAX_VIEWS);
  });

  it('workgroup sizes and array lengths match', () => {
    const sizes = [...cut.matchAll(/@workgroup_size\((\d+)\)/g)].map((m) => Number(m[1]));
    expect(sizes).toContain(CUT_WORKGROUP);
    expect(cut).toContain(`array<atomic<u32>, ${CUT_HIST_WORDS}>`);
    expect(cut).toContain(`array<atomic<u32>, ${CUT_DRAWS_WORDS}>`);
    expect(cutIo).toContain(`array<vec4<f32>, ${CUT_MAX_VIEWS * 6}>`);
  });

  it('the vertex stage unpacks leaf-list entries with the same split', () => {
    expect(vertex).toContain(`entry & 0x${(2 ** LEAF_BLOCK_INDEX_SHIFT - 1).toString(16)}u`);
    expect(vertex).toContain(`entry >> ${LEAF_BLOCK_INDEX_SHIFT}u`);
  });
});

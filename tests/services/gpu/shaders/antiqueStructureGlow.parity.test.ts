/**
 * `structureGlow.wesl` box-means the half-res structure row down to the glow's
 * 1/16: its BLOCK must be the ratio of the two rows' scales, or the structures'
 * outline lands shrunk or shifted against the galaxies' low band.
 */
import { describe, expect, it } from 'vitest';

import { ANTIQUE_CELL, ANTIQUE_STRUCTURE_CELL } from '../../../../src/data/rendering/antiqueLook';
import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';

describe('structureGlow.wesl', () => {
  it('boxes exactly one glow texel of the structure row', () => {
    const block = readShaderSource(
      'src/services/gpu/shaders/antiqueLook/passes/structureGlowFragment.wesl',
    ).match(/const BLOCK: f32 = ([0-9.]+);/);
    expect(Number(block?.[1])).toBe((ANTIQUE_CELL * 4) / ANTIQUE_STRUCTURE_CELL);
  });
});

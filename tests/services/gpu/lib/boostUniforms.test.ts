/**
 * `writeBoostUniforms` against `struct BoostUniforms` (lib/boost.wesl), laid out by WGSL uniform
 * rules from the struct text: a field moved on either side lands a sentinel on the wrong lane.
 */
import { describe, expect, it } from 'vitest';
import type { FrameBoost } from '../../../../src/@types/engine/frame/FrameBoost';
import {
  BOOST_UNIFORM_BYTES,
  writeBoostUniforms,
} from '../../../../src/services/gpu/lib/boostUniforms';
import { layoutWgslStruct } from '../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../tools/utils/wgsl/wgslPrimitiveLayout';

const boostStruct = layoutWgslStruct(
  parseWgslStructFields(
    readShaderSource('src/services/gpu/shaders/lib/boost.wesl'),
    'BoostUniforms',
  ),
  (t) => wgslPrimitiveLayout(t)!,
);

const BOOST: FrameBoost = {
  shipMpc: [9, 9, 9],
  dir: [0.6, 0, 0.8],
  beta: 0.5,
  gamma: 1.25,
  contraction: true,
  doppler: true,
  headlight: 3,
};

describe('writeBoostUniforms', () => {
  it('writeBoostUniforms writes the identity block for null', () => {
    const target = new Float32Array(12).fill(-7);
    writeBoostUniforms(target, 2, null);
    expect(Array.from(target)).toEqual([-7, -7, 0, 0, 0, 0, 0, 0, 0, 0, -7, -7]);
  });

  it('writeBoostUniforms lays out the six fields at the table offsets', () => {
    expect(BOOST_UNIFORM_BYTES).toBe(boostStruct.layout.size);
    const base = 4;
    const target = new Float32Array(base + BOOST_UNIFORM_BYTES / 4);
    writeBoostUniforms(target, base, { ...BOOST, contraction: false });
    const at = (field: string) => target[base + boostStruct.offsets.get(field)! / 4];
    expect([at('dir'), target[base + 1], target[base + 2]]).toEqual([
      Math.fround(0.6),
      0,
      Math.fround(0.8),
    ]);
    expect(at('beta')).toBe(0.5);
    expect(at('gamma')).toBe(1.25);
    expect(at('doppler')).toBe(1);
    expect(at('contraction')).toBe(0);
    expect(at('headlight')).toBe(3);
  });

  it('writeBoostUniforms takes an override dir for a renderer in its own space', () => {
    const target = new Float32Array(8);
    writeBoostUniforms(target, 0, BOOST, [1, 0, 0]);
    expect(Array.from(target.subarray(0, 3))).toEqual([1, 0, 0]);
  });
});

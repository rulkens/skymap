/**
 * `fsMoonPrint` loops over the CPU's picked craters: its array must hold as many as
 * the pick keeps and the packer writes (or the uniform buffer is too small), and its
 * rim fade must start where the pick cuts, or rings pop in at full ink.
 */
import { describe, expect, it } from 'vitest';

import {
  ANTIQUE_MOON_MAX_CRATERS,
  ANTIQUE_MOON_PRINT_BYTES,
  ANTIQUE_MOON_RIM_UNITS,
} from '../../../../src/layers/body/spheres/data/antiqueMoonPrint';
import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';

const src = readShaderSource('src/services/gpu/shaders/bodies/texturedBody/fragment.wesl');
const constant = (name: string) =>
  Number(src.match(new RegExp(`const ${name}: f32 = ([0-9.]+);`))?.[1]);

describe('fsMoonPrint', () => {
  it('holds the picked craters the packer writes', () => {
    expect(Number(src.match(/array<MoonCrater, (\d+)>/)?.[1])).toBe(ANTIQUE_MOON_MAX_CRATERS);
    expect(ANTIQUE_MOON_PRINT_BYTES).toBe(16 + 32 * ANTIQUE_MOON_MAX_CRATERS);
  });

  it('fades rims in from the pick size cut', () => {
    expect([constant('RIM_MIN_UNITS'), constant('RIM_FULL_UNITS')]).toEqual([
      ...ANTIQUE_MOON_RIM_UNITS,
    ]);
  });
});

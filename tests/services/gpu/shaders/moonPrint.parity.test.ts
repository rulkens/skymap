/**
 * `fsMoonPrint` loops over the CPU's picked craters: its array must hold as many as
 * the pick keeps and the packer writes (or the uniform buffer is too small), and its
 * rim fade must start where the pick cuts, or rings pop in at full ink.
 */
import { describe, expect, it } from 'vitest';

import {
  ANTIQUE_MOON_BLANKET,
  ANTIQUE_MOON_EJECTA,
  ANTIQUE_MOON_MAX_CRATERS,
  ANTIQUE_MOON_NAMED_REACH_COS,
  ANTIQUE_MOON_PRINT_BYTES,
  ANTIQUE_MOON_RIM_UNITS,
  ANTIQUE_MOON_TILES,
} from '../../../../src/layers/body/spheres/data/antiqueMoonPrint';
import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';

const src = readShaderSource('src/services/gpu/shaders/bodies/texturedBody/fragment.wesl');
const constant = (name: string) =>
  Number(src.match(new RegExp(`const ${name}: f32 = ([0-9.]+);`))?.[1]);

describe('fsMoonPrint', () => {
  it('holds the picked craters and the tile masks the packer writes', () => {
    const [cols, rows] = ANTIQUE_MOON_TILES;
    expect(Number(src.match(/array<MoonCrater, (\d+)>/)?.[1])).toBe(ANTIQUE_MOON_MAX_CRATERS);
    expect(src).toContain(`const TILES = vec2<i32>(${cols}, ${rows});`);
    expect(Number(src.match(/tiles: array<vec4<u32>, (\d+)>/)?.[1])).toBe((cols * rows) / 2);
    expect(ANTIQUE_MOON_PRINT_BYTES).toBe(32 + 32 * ANTIQUE_MOON_MAX_CRATERS + 8 * cols * rows);
  });

  // The tile masks are bounded on the CPU by these reaches: a shader reaching farther
  // would cut a sea crater's blanket, a rayed one's ejecta or a named mark at a tile's edge.
  it('reaches as far as the tiles are bounded', () => {
    expect(constant('NAMED_REACH_COS')).toBe(ANTIQUE_MOON_NAMED_REACH_COS);
    const [lo, hi] = ANTIQUE_MOON_BLANKET;
    expect(src).toMatch(new RegExp(`const BLANKET = vec2<f32>\\(${lo}, ${hi}\\.0\\);`));
    expect(src).toContain(`const EJECTA = vec2<f32>(${ANTIQUE_MOON_EJECTA.join(', ')});`);
  });

  // The blanket stops each mare line at its own radius, by the plate's row of that line.
  it("cuts the blanket's edge on the plate's mare rows", () => {
    const plate = readShaderSource('src/services/gpu/shaders/antiqueLook/bodies/moon.wesl');
    const pitch = Number(plate.match(/const MOON_PITCH: f32 = ([0-9.]+);/)?.[1]);
    expect(constant('MARE_PITCH_UNITS')).toBe(pitch);
  });

  it('fades rims in from the pick size cut', () => {
    expect([constant('RIM_MIN_UNITS'), constant('RIM_FULL_UNITS')]).toEqual([
      ...ANTIQUE_MOON_RIM_UNITS,
    ]);
  });
});

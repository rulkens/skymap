/**
 * Parity guard: scalarVolume/constants.wesl's LEVEL_TINTS are DENSITY_LEVEL_LEGEND's hexes in
 * linear light, in its order (the shader indexes by it). `?static` linking injects no values,
 * so a drift would leave the debug view's colours disagreeing with its legend unnoticed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DENSITY_LEVEL_LEGEND } from '../../../../src/layers/cosmicWebDensity/densityCubes/data/densityLevelLegend';
import { hexToLinearRgb } from '../../../../src/utils/color/hexToLinearRgb';

const SOURCE = readFileSync(
  join(process.cwd(), 'src/services/gpu/shaders/scalarVolume/constants.wesl'),
  'utf-8',
);

function weslLevelTints(): number[][] {
  const block = /const\s+LEVEL_TINTS\s*=\s*array<vec3<f32>,\s*(\d+)>\(([\s\S]*?)\);/.exec(SOURCE);
  expect(block, 'LEVEL_TINTS not found in constants.wesl').not.toBeNull();
  const tints = [...block![2]!.matchAll(/vec3<f32>\(([^)]*)\)/g)].map((m) =>
    m[1]!.split(',').map((c) => parseFloat(c)),
  );
  expect(tints).toHaveLength(Number(block![1]));
  return tints;
}

describe('constants.wesl LEVEL_TINTS ↔ DENSITY_LEVEL_LEGEND parity', () => {
  it('holds the legend colours in linear light, in legend order', () => {
    const round = (v: number) => Math.round(v * 1000) / 1000;
    const expected = DENSITY_LEVEL_LEGEND.map(({ color }) => hexToLinearRgb(color).map(round));
    expect(weslLevelTints().map((tint) => tint.map(round))).toEqual(expected);
  });
});
